# AuditX Autonomous Agent — Design

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      TRIGGER LAYER                          │
│  Upload endpoint │ Sheet poller │ Email inbox │ pg_cron     │
└────────────────────────────┬────────────────────────────────┘
                             │ enqueue
┌────────────────────────────▼────────────────────────────────┐
│                    agent_jobs (Supabase table)               │
│         idempotency_key · status · retry · dead_letter      │
└────────────────────────────┬────────────────────────────────┘
                             │ poll / dequeue (SKIP LOCKED)
┌────────────────────────────▼────────────────────────────────┐
│                    JOB RUNNER (Edge Function)                │
│  1. Load org policy config                                  │
│  2. Load changed rows only (incremental)                    │
│  3. Fast model → structured plan (JSON schema)              │
│  4. Execute typed tools  ─────────────────────────────────► │
│        read_sheet_range  write_ledger_entry  run_fifo       │
│        reconcile         flag_anomaly        revert         │
│  5. Policy check per step (classifyAction)                  │
│     AUTO → apply + log                                      │
│     NOTIFY → apply + post to activity feed                  │
│     REVIEW → queue to review inbox                          │
│     STOP → insert agent_approvals, halt run                 │
│  6. Verify invariants                                       │
│  7. If invariants fail → revert_run, flag dead_letter       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    SUPABASE POSTGRES                         │
│  transactions · transaction_versions · audit_log (extended) │
│  reconciliation_flags · agent_jobs · agent_approvals        │
│  connected_sources · org_policy_config · activity_feed_view │
└─────────────────────────────────────────────────────────────┘
                             │ realtime
┌────────────────────────────▼────────────────────────────────┐
│                    REACT UI                                  │
│  Activity Feed · Review Inbox · Connected Sources           │
│  (Chat demoted to Q&A)                                      │
└─────────────────────────────────────────────────────────────┘
```

The job runner is a Supabase Edge Function (`supabase/functions/agent-runner/index.ts`). It polls `agent_jobs` on a 5-second tick (invoked by the Supabase scheduled trigger or by a lightweight HTTP cron from the frontend on `agentStop` events). The frontend also triggers it immediately after upload via a POST to `/api/agent/run`.

---

## 2. Data Model Changes

### New tables (SQL migrations)

```sql
-- Job queue
CREATE TABLE agent_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  trigger_type     TEXT NOT NULL,         -- upload | sheet_change | email | cron_nightly | cron_monthly | manual
  trigger_payload  JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','done','failed','dead_letter')),
  run_id           UUID,                  -- set when job starts
  idempotency_key  TEXT NOT NULL UNIQUE,
  attempt_count    INT NOT NULL DEFAULT 0,
  max_attempts     INT NOT NULL DEFAULT 3,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_jobs_pending ON agent_jobs (org_id, next_run_at)
  WHERE status = 'pending';

-- Transaction version history
CREATE TABLE transaction_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  run_id         UUID,
  snapshot       JSONB NOT NULL,       -- full transactions row before change
  policy_tier    TEXT NOT NULL,        -- AUTO | NOTIFY | REVIEW | STOP
  source_provenance JSONB NOT NULL DEFAULT '{}',
  revert_of      UUID REFERENCES transaction_versions(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX txv_by_run ON transaction_versions (run_id);
CREATE INDEX txv_by_tx  ON transaction_versions (transaction_id, created_at DESC);

-- Human approvals for STOP-tier and REVIEW-tier items
CREATE TABLE agent_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  job_id       UUID REFERENCES agent_jobs(id),
  run_id       UUID,
  action_type  TEXT NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}',
  policy_tier  TEXT NOT NULL DEFAULT 'STOP',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  decided_by   UUID REFERENCES auth.users(id),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Connected external sources (Google Sheets, OneDrive)
CREATE TABLE connected_sources (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id),
  source_type          TEXT NOT NULL CHECK (source_type IN ('google_sheets','onedrive','email_inbox','folder')),
  external_id          TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  oauth_token_encrypted TEXT,            -- stored via Supabase Vault
  last_etag            TEXT,
  last_hash            TEXT,
  watch_expiry         TIMESTAMPTZ,
  paused               BOOLEAN NOT NULL DEFAULT FALSE,
  rules                JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, source_type, external_id)
);

-- Per-org policy configuration
CREATE TABLE org_policy_config (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          UUID NOT NULL UNIQUE REFERENCES organizations(id),
  auto_fix_duplicate_under_amount NUMERIC,
  never_touch_closed_periods_before DATE,
  confidence_threshold_auto       NUMERIC NOT NULL DEFAULT 0.9,
  confidence_threshold_notify     NUMERIC NOT NULL DEFAULT 0.75,
  allowed_auto_actions            TEXT[] NOT NULL DEFAULT ARRAY['flag_anomaly','run_fifo','categorize'],
  daily_token_budget              INT,
  daily_cost_budget_usd           NUMERIC,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flags per org
CREATE TABLE org_feature_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL UNIQUE REFERENCES organizations(id),
  autonomous_agent BOOLEAN NOT NULL DEFAULT FALSE,
  max_connected_sources INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification preferences per user
CREATE TABLE notification_prefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  email_notify    BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_auto   BOOLEAN NOT NULL DEFAULT FALSE,
  email_on_notify BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_review BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_stop   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Existing table changes

```sql
-- Extend audit_log (non-breaking — nullable columns)
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS run_id       UUID,
  ADD COLUMN IF NOT EXISTS policy_tier  TEXT;

-- Extend notifications (severity column already exists; add title if missing)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
```

### pg_cron expressions

```sql
-- Nightly reconciliation (01:00 UTC)
SELECT cron.schedule('nightly-reconcile', '0 1 * * *',
  $$INSERT INTO agent_jobs (org_id, trigger_type, idempotency_key)
    SELECT id, 'cron_nightly', 'nightly:' || id::text || ':' || to_char(now(), 'YYYY-MM-DD')
    FROM organizations
    WHERE id IN (SELECT org_id FROM org_feature_flags WHERE autonomous_agent = true)
    ON CONFLICT (idempotency_key) DO NOTHING$$
);

-- Month-end tax run (23:00 UTC on the last day of each month)
SELECT cron.schedule('monthly-tax', '0 23 28-31 * *',
  $$INSERT INTO agent_jobs (org_id, trigger_type, idempotency_key)
    SELECT id, 'cron_monthly', 'monthly:' || id::text || ':' || to_char(now(), 'YYYY-MM')
    FROM organizations
    WHERE date_trunc('month', now() + interval '1 day') != date_trunc('month', now())
    AND id IN (SELECT org_id FROM org_feature_flags WHERE autonomous_agent = true)
    ON CONFLICT (idempotency_key) DO NOTHING$$
);
```

---

## 3. Policy Engine

Location: `src/lib/policy-engine.ts` (shared between server routes and Edge Functions).

```typescript
export type PolicyTier = 'AUTO' | 'NOTIFY' | 'REVIEW' | 'STOP';

export interface AgentAction {
  tool: string;           // e.g. 'insert_transaction', 'run_fifo', 'delete_transaction'
  confidence: number;     // 0–1
  affects: 'source' | 'ledger' | 'flag' | 'report' | 'classification';
  isDestructive: boolean;
  isClosedPeriod: boolean;
  amountUsd?: number;
}

export interface PolicyContext {
  config: OrgPolicyConfig;
  runId: string;
}

export function classifyAction(action: AgentAction, ctx: PolicyContext): PolicyTier {
  // STOP conditions (hard overrides)
  if (action.affects === 'source') return 'STOP';
  if (action.isDestructive) return 'STOP';
  if (action.tool === 'export_tax_report') return 'STOP';
  if (action.isClosedPeriod) return 'STOP';

  // AUTO conditions
  const autoTools = ctx.config.allowed_auto_actions;
  const aboveAutoThreshold = action.confidence >= ctx.config.confidence_threshold_auto;
  const underAmountLimit =
    !action.amountUsd ||
    !ctx.config.auto_fix_duplicate_under_amount ||
    action.amountUsd < ctx.config.auto_fix_duplicate_under_amount;

  if (autoTools.includes(action.tool) && aboveAutoThreshold && underAmountLimit) return 'AUTO';

  // NOTIFY conditions
  const aboveNotifyThreshold = action.confidence >= ctx.config.confidence_threshold_notify;
  if (aboveNotifyThreshold) return 'NOTIFY';

  // Default: REVIEW
  return 'REVIEW';
}
```

---

## 4. Model Routing Table

Location: `src/lib/model-routing.ts`

```typescript
export interface ModelRoute {
  primary: string;
  fallbacks: string[];
}

export type TaskType = 'extraction' | 'classification' | 'reasoning' | 'explanation' | 'dedup';

export const MODEL_ROUTING_TABLE: Record<TaskType, ModelRoute> = {
  extraction:     { primary: 'openai/gpt-4o-mini',          fallbacks: ['meta-llama/llama-3.3-70b-instruct:free', 'mistralai/mistral-7b-instruct:free'] },
  classification: { primary: 'openai/gpt-4o-mini',          fallbacks: ['meta-llama/llama-3.3-70b-instruct:free'] },
  dedup:          { primary: 'openai/gpt-4o-mini',          fallbacks: ['mistralai/mistral-7b-instruct:free'] },
  reasoning:      { primary: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o', fallbacks: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku'] },
  explanation:    { primary: 'openai/gpt-4o-mini',          fallbacks: ['meta-llama/llama-3.3-70b-instruct:free'] },
};
```

The `resolveAgentModel` function in `audit-agent.server.ts` is wrapped (not modified) by a new `resolveTaskModel(task: TaskType, env?)` function that consults the routing table then passes the resolved model string to the existing provider factory.

---

## 5. Agent Run Loop (Edge Function)

Location: `supabase/functions/agent-runner/index.ts`

```
1. Dequeue one pending job (SELECT FOR UPDATE SKIP LOCKED, status → 'running', run_id = new UUID)
2. Load org policy from org_policy_config (or insert defaults)
3. Check feature flag (org_feature_flags.autonomous_agent); abort if false
4. Check daily token budget; defer if exceeded
5. Load only changed/relevant rows (incremental diff using job.trigger_payload)
6. SELECT fast model (extraction/classification route) → call LLM with JSON schema → parse plan
7. For each step in plan:
   a. classifyAction(step, policyCtx) → tier
   b. If AUTO:   execute typed tool → snapshot to transaction_versions → audit_log
   c. If NOTIFY: execute typed tool → snapshot → audit_log → insert notification
   d. If REVIEW: insert agent_approvals (pending) → insert notification → skip execution
   e. If STOP:   insert agent_approvals (pending) → insert notification → halt run
8. Run invariant checks (plain TypeScript):
   - No quantity ≤ 0
   - No SELL > available inventory
   - ledger_entries balance per transaction
   - No orphan reconciliation_flags
9. If any invariant fails → revert_run(run_id) → set job.status = 'failed_invariant'
10. If all pass → set job.status = 'done'
11. On uncaught error → increment attempt_count; if >= max_attempts → 'dead_letter'
```

**Typed tools available to the runner** (no free-form SQL):
- `read_ledger_range(orgId, ticker?, dateFrom?, dateTo?)` → Transaction[]
- `write_ledger_entry(orgId, payload, runId, policyTier)` → versions before write
- `run_fifo(orgId, taxYear)` → TaxComputation (calls existing `computeTax`)
- `reconcile(orgId, runId)` → ReconciliationResult
- `flag_anomaly(orgId, payload, runId)` → ReconciliationFlag
- `revert_run(runId)` → boolean
- `check_invariants(orgId, runId)` → InvariantResult

---

## 6. Debounce and Idempotency

- Sheet change events: debounce 8 seconds on the poller. A new hash check within the debounce window updates the idempotency key; the superseded job is silently discarded.
- Idempotency key format: `{trigger_type}:{org_id}:{content_hash}:{date}` for external sources, `{trigger_type}:{org_id}:{document_id}` for uploads.
- Per-org concurrency: at most 2 `running` jobs per org at once (enforced by a pre-check in the dequeue query).

---

## 7. Loop Prevention

Every agent write sets `source.agent_run_id = run_id` on the `transactions` row. The sheet poller, before enqueuing, fetches the latest `transactions` rows for the org and checks whether the most recent `source.agent_run_id` matches a recently completed run for that org. If yes, and the content hash matches the expected post-run state, the event is ignored.

---

## 8. Parallel Extraction

For multi-page documents:
1. PDF is split into individual page images (server-side using `pdf-lib` or a Supabase Edge Function with `pdfjs-dist`).
2. Each page spawns an independent extraction sub-job tagged with the parent `document_id`.
3. Up to 8 concurrent LLM calls per org (semaphore counter in `agent_jobs` running count).
4. Results are merged by a deterministic dedup function: rows matching on `(ticker, trade_date, ref_id)` with ≤ 1% price delta are collapsed; the highest-confidence version is kept.

---

## 9. UI Components to Build

| Component | Route | Notes |
|---|---|---|
| `ActivityFeed` | `/app/activity` | Real-time Supabase subscription on `agent_jobs` + `transaction_versions` |
| `ReviewInbox` | `/app/review` | Polls `agent_approvals` where status = 'pending' and tier = 'REVIEW' |
| `ConnectedSources` | Settings tab | OAuth flows for Google/OneDrive, per-source rule editor |
| Nav badge | `AppNav` | Count of pending REVIEW items and STOP approvals |
| Chat demotion | `ParserWorkspace` | Move to opt-in, update copy |
| Landing copy | `index.tsx` | Hero + features section update |

---

## 10. Phase Plan

### Phase 1 — Foundation (implement after spec approval)
- Policy engine (`src/lib/policy-engine.ts`) + unit tests
- `transaction_versions` table + `revert_run` function
- Extend `audit_log` with `run_id` + `policy_tier`
- Model routing table (`src/lib/model-routing.ts`) wrapping existing `resolveAgentModel`
- Structured JSON-schema outputs on all extraction calls
- Parallel page extraction for PDF uploads
- Feature flag table + plan gating

### Phase 2 — Queue + Sheet Watch + Activity Feed
- `agent_jobs` table + Edge Function job runner
- Google Sheets poller (polling + etag/hash, loop prevention)
- Activity Feed UI + Review Inbox UI
- Nightly reconciliation cron job
- Per-org concurrency and debounce

### Phase 3 — More Sources + Scheduled Runs + Notifications
- OneDrive/Graph change notifications connector
- Email inbox ingestion (Supabase inbound email or forwarding webhook)
- Month-end tax run + FIFO lot check
- `org_policy_config` settings UI (per-source rules)
- Email notifications via Edge Function
- Connected Sources settings tab

### Phase 4 — Learning + Proactive
- Record user approvals/rejections into per-org policy rules ("auto-learn")
- Proactive tax-loss harvesting suggestions from FIFO engine
- Multi-client support for Enterprise plan
- API access endpoints

---

## 11. Test Plan

| Test | Type | What it proves |
|---|---|---|
| Policy tier decisions (20 cases) | Unit | classifyAction returns correct tier for AUTO/NOTIFY/REVIEW/STOP across boundary conditions |
| Loop prevention | Integration | Agent write does not re-trigger ingestion |
| Idempotency | Integration | Same idempotency_key inserted twice = one job |
| Invariant failure rollback | Integration | Negative-quantity transaction triggers revert_run |
| Revert correctness | Integration | insert → update → revert produces original row |
| FIFO determinism | Unit | Same input always produces same TaxComputation |
| Schema validation | Unit | Malformed LLM response raises SchemaValidationError |
| Parallel extraction merge | Unit | Duplicate page results collapse to highest-confidence version |
| STOP gate | Unit | STOP action without approval raises PolicyViolationError |
| Budget enforcement | Unit | Run defers when daily_token_budget would be exceeded |
