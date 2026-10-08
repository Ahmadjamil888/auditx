# AuditX Autonomous Agent — Requirements

## Step 0: Discovery Report

### What was found

**Backend language and framework**
TypeScript throughout. The server runs on TanStack Start (built on Vite + Nitro). API routes live in `src/routes/api/` as file-based route handlers that export `server.handlers`. The runtime target is Cloudflare Workers / Bun (Nitro preset), deployed to Lovable Cloud.

**Database and schema**
Supabase PostgreSQL with Row Level Security. The authoritative schema is in `supabase/schema.sql` (20 tables). The Drizzle config exists but the `drizzle/schema.ts` is empty — migrations are applied directly to Supabase via SQL files in `supabase/migrations/`. Relevant tables:
- `organizations`, `profiles`, `subscriptions` — auth/org/billing
- `transactions` — the ledger (ticker, action, qty, price, fees, wht, confidence_score, status, source JSONB)
- `ledger_entries` — double-entry side (underused today)
- `documents` — uploaded files with extracted_data JSONB
- `reconciliation_flags` — anomalies with severity ok/warn/bad
- `audit_log` — hash-chained append-only event log
- `ai_usage` — per-request token quota tracking
- `notifications` — in-app notification feed
- `financial_events`, `financial_insights`, `financial_investigations` — scaffolded intelligence tables (not yet populated by background jobs)
- `chat_threads`, `chat_messages` — persistent AI conversation

**Hosting**
Primary: Lovable Cloud (LOVABLE_API_KEY present). Secondary fallback: any Vite/Nitro deployment (Vercel, Cloudflare). The app detects its own host and routes AI calls accordingly.

**OpenRouter calls today**
Two call sites:
1. `src/lib/ai-service.ts` — client-side (browser), uses `VITE_OPENROUTER_API_KEY`, 6-model free-tier cascade for document parsing and portfolio analysis.
2. `src/lib/audit-agent.server.ts` — server-side, tries `LOVABLE_API_KEY` → `OPENROUTER_API_KEY` → `GROQ_API_KEY`, model configurable via `OPENROUTER_MODEL` env var. This powers `/api/chat`.

**Where confirmation prompts are generated**
`ParserWorkspace.tsx` wraps every write tool (`insert_transaction`, `update_transaction`, `flag_anomaly`, `resolve_flag`, `delete_transaction`) with AI SDK approval gates — the AI SDK emits `approval-requested` state, and the UI renders Approve/Reject buttons. `delete_transaction` is the only tool configured with `"user-approval"` in `toolApproval`. The other writes execute immediately via the AI chat loop with no user gate. There is no programmatic policy engine — the system prompt says "act directly, do NOT ask should I proceed?".

**Ledger and audit log storage**
Both in Supabase. `transactions` is the live ledger. `audit_log` stores every write with prev_hash/hash chaining. `ledger_entries` stores the double-entry bookkeeping side (currently populated only on insert, not used for reconciliation). There is no version history or snapshot table — updates overwrite in place.

**Auth and org model**
Supabase Auth (email + Google OAuth). First login calls `provision_current_user` RPC which atomically creates org + profile + free subscription. One user = one org today. Four roles: owner, admin, analyst, viewer (enforced by RLS). `organizations.jurisdiction_default` drives tax rules.

**Feature flags**
No formal system. Plan-based entitlement checks only (`src/lib/plans.ts` + inline quota checks in `/api/chat`). Plans: free (50 tx/month, 20 AI req/day), pro (unlimited tx, 100 AI req/day), enterprise (unlimited, 500 AI req/day).

**Queue / background jobs**
None. No BullMQ, no cron, no Supabase Edge Functions, no scheduled tasks. All work is synchronous and request-triggered.

**File ingestion paths**
1. Parser Workspace — user attaches file to chat, server converts XLSX to text, PDFs are passed as multimodal parts to the LLM inside `/api/chat`.
2. Ledger ImportPanel — client-side XLSX parse → AI extraction (via `/api/chat`) → review step → user confirms → writes.
3. Legacy agent (`ai-service.ts`) — browser base64 → Groq parse → show fields → no direct write.

---

### Assumptions

1. The autonomous agent will use Supabase Edge Functions (Deno) for background jobs because there is no external worker infrastructure and the project is already fully committed to Supabase.
2. A durable job queue will be implemented using a Supabase `agent_jobs` table with polling (PGMQ or a simple SELECT FOR UPDATE SKIP LOCKED pattern), not an external queue service, because the Lovable Cloud environment does not expose BullMQ or Redis.
3. Google Sheets and OneDrive connectors store OAuth tokens in a new `connected_sources` table with Vault-encrypted token storage.
4. The nightly and month-end scheduled jobs will be driven by `pg_cron` (available in Supabase Pro) or by a lightweight cron Edge Function invoked via Supabase's scheduled trigger.
5. The feature flag system for autonomous mode will be a simple `org_feature_flags` table (boolean per feature per org) rather than a third-party service.
6. The existing `audit_log` table is extended (not replaced) with run_id and policy_tier columns to support the reversibility story.

---

## Requirements

### 1. Policy Engine

**REQ-POL-01** Every agent-initiated ledger write must be classified into exactly one of four tiers before execution: AUTO, NOTIFY, REVIEW, STOP. The classification must run in code, never inside a prompt.

Acceptance criteria:
- A TypeScript function `classifyAction(action: AgentAction, context: PolicyContext): PolicyTier` is exported from a dedicated policy module.
- Given a duplicate-transaction removal action with confidence ≥ 0.95, the function returns `AUTO`.
- Given a fee mismatch correction matched to a source document, the function returns `NOTIFY`.
- Given a field extraction with confidence < 0.75, the function returns `REVIEW`.
- Given a source-file overwrite or tax report export, the function returns `STOP`.
- Unit tests cover each tier with ≥ 5 cases per tier.

**REQ-POL-02** Per-org standing policy rules are stored in a `org_policy_config` table and enforced by the policy engine before every write.

Acceptance criteria:
- The table stores: `auto_fix_duplicate_under_amount`, `never_touch_closed_periods_before`, `confidence_threshold_auto`, `confidence_threshold_notify`, and `allowed_auto_actions` (array).
- The policy engine reads the org config before every classification; if no row exists it uses system defaults.
- A test confirms that if `confidence_threshold_auto` is set to 0.9, an action with confidence 0.88 is not classified AUTO.

**REQ-POL-03** STOP actions must never execute without an explicit human approval stored in the `agent_approvals` table.

Acceptance criteria:
- A STOP action inserts a row into `agent_approvals` with status `pending` and halts the job.
- The job resumes only when the row is updated to `approved` by a user with role owner or admin.
- A test confirms that a STOP action attempted without a corresponding approved row fails with a `PolicyViolationError`.

---

### 2. Versioned, Reversible Writes

**REQ-VER-01** Every agent-initiated change to `transactions` is recorded in a `transaction_versions` table before the row is mutated, enabling point-in-time revert.

Acceptance criteria:
- The `transaction_versions` table contains: `id`, `transaction_id`, `org_id`, `run_id`, `snapshot` (JSONB — full row before change), `policy_tier`, `source_provenance` (JSONB), `created_at`.
- A revert operation restores the snapshot to the live `transactions` row and writes a new version row tagged `revert_of: original_version_id`.
- Reverting a revert is supported.
- A test confirms that after insert → update → revert, the transaction row matches the post-insert state.

**REQ-VER-02** The existing `audit_log` table is extended with `run_id UUID` and `policy_tier TEXT` columns without breaking existing queries.

Acceptance criteria:
- A migration adds the two nullable columns.
- All new agent writes populate both columns.
- Existing reads that do not reference the new columns continue to work.

**REQ-VER-03** A single `revert_run(run_id)` function rolls back all writes from one agent run atomically.

Acceptance criteria:
- The function wraps all reversions in a single Postgres transaction.
- If any individual revert fails, the whole rollback is rolled back and the error is logged.
- A test with a 5-write run confirms that after `revert_run`, all 5 rows return to their pre-run state.

---

### 3. Model Routing

**REQ-MODEL-01** A configurable routing table selects the model for each task type. The only thing that varies per call is the `model` string (and the fallback list). Keys, endpoints, and auth are not touched.

Acceptance criteria:
- A `MODEL_ROUTING_TABLE` constant (or env-overridable config) maps task types (`extraction`, `classification`, `reasoning`, `explanation`) to `{ primary: string, fallbacks: string[] }`.
- `extraction` and `classification` default to the cheapest fast model; `reasoning` defaults to the strongest available model.
- The routing config is read once at module load and cached.
- Changing `OPENROUTER_MODEL` env var overrides the `reasoning` primary model.

**REQ-MODEL-02** Structured JSON-schema outputs are used on every non-conversational LLM call to eliminate malformed-output retries.

Acceptance criteria:
- All agent tool calls and extraction calls pass a `response_format: { type: "json_schema", json_schema: { ... } }` parameter.
- A test injects a mocked LLM response that omits a required field and confirms the agent raises `SchemaValidationError` rather than silently accepting it.

---

### 4. Event-Driven Triggers

**REQ-EVT-01** An `agent_jobs` table acts as a durable job queue with at-least-once delivery, retries, dead-letter handling, and per-org concurrency limits.

Acceptance criteria:
- Table columns: `id`, `org_id`, `trigger_type`, `trigger_payload` (JSONB), `status` (`pending`/`running`/`done`/`failed`/`dead_letter`), `run_id`, `idempotency_key` (unique), `attempt_count`, `max_attempts`, `next_run_at`, `created_at`, `updated_at`.
- A job dequeued by a worker is locked via `SELECT FOR UPDATE SKIP LOCKED` and immediately updated to `running`.
- After `max_attempts` failures the job moves to `dead_letter`.
- Inserting the same `idempotency_key` twice is a no-op (Postgres `ON CONFLICT DO NOTHING`).

**REQ-EVT-02** A document upload triggers an autonomous extraction → reconciliation → anomaly detection pipeline without a user prompt.

Acceptance criteria:
- Uploading a PDF or XLSX to `/api/documents/upload` enqueues an `extraction` job within 2 seconds.
- The extraction job completes, then automatically enqueues a `reconciliation` job.
- The reconciliation job completes, then automatically enqueues an `anomaly_detection` job.
- Each step posts a progress update to `financial_events`.
- A user visiting the Activity Feed sees the full chain within 30 seconds of upload.

**REQ-EVT-03** Google Sheets connected as a source are polled every 60 seconds with etag/hash-based change detection; a push notification is set up where the Drive API supports it.

Acceptance criteria:
- A `connected_sources` table stores: `id`, `org_id`, `source_type` (`google_sheets`/`onedrive`), `external_id`, `display_name`, `oauth_token_encrypted`, `last_etag`, `last_hash`, `watch_expiry`, `paused`, `created_at`.
- The poller compares SHA-256(content) with `last_hash`; if unchanged, no job is enqueued.
- If content changes, an `ingestion` job is enqueued with `idempotency_key = source_id + ":" + new_hash`.
- Loop prevention: agent write events update `last_hash` to the post-write hash so the agent's own writes do not re-trigger ingestion.

**REQ-EVT-04** Scheduled jobs run nightly (reconciliation) and monthly (tax run, FIFO lot check) without manual triggers.

Acceptance criteria:
- A nightly job at 01:00 org-local-time runs reconciliation for all active orgs.
- A month-end job (last day of month, 23:00) runs FIFO and saves a `tax_computations` snapshot.
- Both are driven by `pg_cron` expressions or equivalent scheduled Edge Function invocation.
- A test mocks the cron trigger and confirms a row appears in `agent_jobs` for every active org.

---

### 5. Loop Prevention

**REQ-LOOP-01** Every agent write tags the `source` JSONB on the affected row with `agent_run_id`.

Acceptance criteria:
- All INSERT/UPDATE operations from agent runs set `source.agent_run_id = run_id`.
- The ingestion poller checks whether the latest change to a connected sheet was caused by an agent write for the same org; if so, the event is skipped.
- A test simulates: (1) agent writes to ledger, (2) ledger change triggers notional re-read of source, (3) confirms no new job is enqueued.

---

### 6. Parallel Extraction

**REQ-PAR-01** Multi-page documents are split into individual pages and extracted in parallel, then merged.

Acceptance criteria:
- A PDF with N pages spawns N extraction sub-tasks running concurrently (capped at 8 concurrent LLM calls per org).
- Results are merged by a deterministic dedup function: rows with matching `(ticker, trade_date, ref_id)` are collapsed to one.
- Total extraction wall-clock time for a 10-page PDF is less than 2× the time for a single page (measured in integration test with mocked LLM).

---

### 7. Invariant Checks

**REQ-INV-01** After every agent run, a set of data-integrity invariants is checked in plain code.

Acceptance criteria:
- The invariant suite checks: (a) no transaction has quantity ≤ 0, (b) no SELL exceeds available buy inventory for the ticker, (c) debits equal credits in `ledger_entries` per transaction, (d) no orphan `reconciliation_flags` reference a deleted transaction.
- If any invariant fails, `revert_run(run_id)` is called automatically and the run is flagged `failed_invariant` in `agent_jobs`.
- A test injects a negative-quantity transaction and confirms the whole run is rolled back.

---

### 8. Activity Feed and Review Inbox

**REQ-UI-01** An Activity Feed page shows agent actions grouped by run, with per-action revert buttons for AUTO and NOTIFY tier actions.

Acceptance criteria:
- The feed shows: timestamp, trigger description, number of actions, policy tier badge, and a "Revert run" button.
- Clicking "Revert run" calls `revert_run(run_id)` and optimistically removes the row; on error it restores it with an error toast.
- STOP-tier items show as "Pending approval" with Approve/Reject buttons.
- The feed is a real-time Supabase subscription on `agent_jobs` and `transaction_versions`.

**REQ-UI-02** A Review Inbox batches REVIEW-tier items into a single view where each item can be approved, rejected, or skipped.

Acceptance criteria:
- Each inbox item shows: field name, extracted value, confidence score, source document snippet, and proposed action.
- Approving applies the change immediately and records the approval in `agent_approvals`.
- Rejecting discards the proposed change and records the rejection.
- Skipping leaves the item in the inbox.
- The inbox count appears as a badge on the nav item.

**REQ-UI-03** Chat is demoted to a Q&A-only tool with a visible "for questions only" label; it no longer auto-starts on page load.

Acceptance criteria:
- The Parser route no longer creates a new chat thread on first navigation unless the user explicitly clicks "Ask a question".
- The chat input placeholder reads "Ask AuditX a question about your data…" instead of the current prompt-action copy.

---

### 9. Connected Sources Settings

**REQ-SRC-01** A Connected Sources settings tab allows users to connect Google Sheets and OneDrive files, set per-source rules, and pause/resume the agent.

Acceptance criteria:
- Connecting a Google Sheet completes the OAuth flow and inserts a row into `connected_sources`.
- A per-source rule editor lets users set: `auto_import` (boolean), `confidence_threshold_override`, `never_overwrite_before_date`.
- Pausing a source sets `paused = true`; no jobs are enqueued for it while paused.
- Deleting a source removes OAuth tokens and stops polling.

---

### 10. Cost and Safety

**REQ-COST-01** Per-org daily token/cost budgets are enforced with graceful degradation.

Acceptance criteria:
- `org_policy_config` includes `daily_token_budget` and `daily_cost_budget_usd`.
- When a run would exceed the budget, it is deferred to the next day and a NOTIFY-tier notification is sent.
- The budget check happens before dispatching any LLM call.

**REQ-COST-02** Per-org tool permission scoping limits which tools an autonomous agent run may use.

Acceptance criteria:
- `org_policy_config.allowed_auto_actions` lists the tool names the agent may call in AUTO tier without user approval.
- Any tool call not in the allowed list is escalated to the appropriate higher tier.

---

### 11. Notifications

**REQ-NOTIF-01** NOTIFY-tier and STOP-tier events produce in-app and email notifications.

Acceptance criteria:
- NOTIFY events insert into `notifications` with `severity = "info"` and optionally send an email via a Supabase Edge Function calling the configured email provider.
- STOP events insert with `severity = "warning"` and always trigger email.
- Notification preferences (email on/off, per-severity) are stored in a new `notification_prefs` table per user.

---

### 12. Plan Packaging

**REQ-PLAN-01** Autonomous mode is gated by plan behind the `autonomous_agent` feature flag.

Acceptance criteria:
- Free plan: feature flag `autonomous_agent = false`; the Connected Sources tab is visible but shows an upgrade prompt.
- Pro plan: `autonomous_agent = true`; limited to 3 connected sources, 1 org.
- Enterprise plan: `autonomous_agent = true`; unlimited connected sources, multi-client.
- The feature flag is checked server-side in the job runner, not only client-side.

---

### 13. Landing Page

**REQ-LAND-01** Landing page copy is updated to reflect autonomous, traceable operation.

Acceptance criteria:
- The hero headline no longer contains the phrase "asking before writing" or equivalent.
- A new value-prop line reads approximately: "Acts on your data. Every change is traceable and reversible."
- The features list includes "Continuous monitoring", "Activity feed with one-click revert", and "Review inbox for anything uncertain".
