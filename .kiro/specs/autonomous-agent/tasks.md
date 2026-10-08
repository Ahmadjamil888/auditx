# AuditX Autonomous Agent — Task List

## Phase 1: Policy Engine, Versioned Writes, Model Routing, Parallel Extraction

- [ ] 1. Create `org_policy_config`, `org_feature_flags`, `transaction_versions`, `agent_approvals` tables
  - Write and apply the SQL migration for all four new tables
  - Add nullable `run_id` and `policy_tier` columns to `audit_log`
  - Add RLS policies: org members can read their own rows; only the service role can insert into `transaction_versions`
  - Verify with a Supabase query that all tables exist and constraints are correct

- [ ] 2. Implement `src/lib/policy-engine.ts`
  - Export `classifyAction(action: AgentAction, ctx: PolicyContext): PolicyTier`
  - Export default policy config constants (threshold values, default allowed actions)
  - Export `loadOrgPolicy(orgId: string): Promise<OrgPolicyConfig>` — reads `org_policy_config`, falls back to defaults
  - Export `PolicyViolationError` class
  - Write unit tests: 5 cases per tier (AUTO, NOTIFY, REVIEW, STOP), boundary confidence values, closed-period check, amount-limit check

- [ ] 3. Implement `src/lib/model-routing.ts`
  - Export `MODEL_ROUTING_TABLE` constant mapping task types to primary + fallback model strings
  - Export `resolveTaskModel(task: TaskType, env?: Record<string, unknown>): Promise<ResolvedModel>` that wraps (not modifies) `resolveAgentModel` from `audit-agent.server.ts`
  - Confirm the existing `resolveAgentModel` function is unchanged; only the `model` string passed to it may differ
  - Write unit tests: routing returns correct model per task type; env override for `OPENROUTER_MODEL` applies to `reasoning` task only

- [ ] 4. Implement `src/lib/versioned-writes.ts`
  - Export `snapshotAndWrite(orgId, runId, policyTier, txId, updates, provenance)` — inserts a `transaction_versions` snapshot then applies the update
  - Export `revertVersion(versionId)` — restores snapshot to the live row, inserts a new version row tagged `revert_of`
  - Export `revertRun(runId)` — wraps all reversions for a run in one Postgres transaction via `supabase.rpc`
  - Create a `revert_run(p_run_id UUID)` Postgres function in a migration that performs the atomic rollback
  - Write integration tests: insert → update → revert produces original row; multi-write run reverts all; revert of revert is idempotent

- [ ] 5. Add structured JSON-schema validation to all LLM extraction calls
  - Create `src/lib/schema-validator.ts` with `validateAgentOutput<T>(raw: unknown, schema: ZodSchema<T>): T` that throws `SchemaValidationError` on mismatch
  - Update `parseDocument` and `parseTextDocument` in `src/lib/ai-service.ts` to pass the output through `validateAgentOutput`
  - Update the `delegate_agent` tool in `src/routes/api/chat.ts` to validate structured outputs
  - Write unit test: mocked LLM response missing a required field raises `SchemaValidationError`

- [ ] 6. Implement parallel page extraction for PDF uploads
  - Create `src/lib/pdf-splitter.ts` (server-only) using `pdfjs-dist` to split a PDF buffer into per-page image buffers
  - Update the document upload handler (`src/routes/api/documents/upload.ts` or equivalent) to split PDFs and run `parseDocument` on each page concurrently (cap at 8 concurrent per org)
  - Implement `mergeExtractionResults(results: ParsedStatement[]): ParsedStatement` — dedup by `(ticker, trade_date, ref_id)`, keep highest confidence
  - Write unit test: 10-page mock PDF produces 10 sub-tasks; duplicate results collapse to one

- [ ] 7. Create `org_feature_flags` default rows and plan gating
  - Write a migration that inserts a default `org_feature_flags` row for every existing org (autonomous_agent = false, max_connected_sources = 0)
  - Update provisioning (`provision_current_user` RPC or post-provision hook) to insert a default flags row for new orgs
  - Add server-side plan check in `/api/chat.ts`: if `autonomous_agent = false` for the org and the request originates from an autonomous trigger (not a user chat), return 403
  - Write unit test: plan check blocks autonomous calls for free-plan orgs

---

## Phase 2: Job Queue, Google Sheets Watch, Loop Prevention, Activity Feed

- [ ] 8. Create `agent_jobs` table and dequeue function
  - Apply migration for `agent_jobs` table with all columns and indexes
  - Create `dequeue_agent_job(p_worker_id TEXT)` Postgres function: SELECT FOR UPDATE SKIP LOCKED, status → 'running', run_id → new UUID, attempt_count++, returns job row or NULL
  - Create `complete_agent_job(p_job_id UUID, p_status TEXT, p_error TEXT)` Postgres function
  - Apply RLS: jobs are readable by org members; only service role may update status
  - Write integration test: two concurrent dequeue calls each get a different job (SKIP LOCKED confirmed)

- [ ] 9. Implement the Edge Function job runner skeleton
  - Create `supabase/functions/agent-runner/index.ts`
  - On invocation: call `dequeue_agent_job`, load org policy, check feature flag and budget, dispatch to the correct handler based on `trigger_type`
  - Implement the invariant check suite as a plain TypeScript module imported by the runner: quantity > 0, SELL ≤ available inventory, ledger_entries balance, no orphan flags
  - On invariant failure: call `revertRun(runId)`, set job to `failed_invariant`
  - On unhandled error: increment attempt_count; after max_attempts set `dead_letter`
  - Write integration test: a job that produces a negative-quantity transaction is rolled back and marked `failed_invariant`

- [ ] 10. Implement Google Sheets change poller
  - Create `supabase/functions/sheets-poller/index.ts` (invoked every 60 seconds via scheduled trigger)
  - For each non-paused `connected_sources` row with `source_type = 'google_sheets'`:
    - Fetch CSV from the Google Sheets export URL using the stored OAuth token
    - Compute SHA-256 hash of content
    - If hash differs from `last_hash`, enqueue an `ingestion` job with `idempotency_key = source_id + ':' + new_hash`
    - Update `last_hash` and `last_etag`
  - Loop prevention: before enqueuing, check if any recently completed job for this org set `source.agent_run_id` that produced the current hash; skip if so
  - Write integration test: poller skips enqueue when hash is unchanged; enqueues when content changes; agent-written hash does not re-trigger

- [ ] 11. Implement ingestion handler in the job runner
  - Implement `handleIngestion(job)` in the runner: parse CSV/XLSX deterministically (no LLM for structured files), run policy engine per row, apply AUTO writes immediately, queue NOTIFY/REVIEW/STOP items
  - The LLM is only called for unstructured extraction (PDFs, free-text rows) — pass through `resolveTaskModel('extraction')`
  - Debounce: if a job with the same source_id was completed < 8 seconds ago, delay the new job by the remainder
  - Write unit test: a CSV with 3 clean rows and 1 duplicate produces 3 AUTO inserts and 1 REVIEW item

- [ ] 12. Nightly reconciliation cron job
  - Apply pg_cron schedule (or equivalent Supabase scheduled trigger) to insert nightly `agent_jobs` rows for all autonomous orgs
  - Implement `handleNightlyReconcile(job)` in the runner: load all `transactions` for the org, run deterministic reconciliation (pure TypeScript — match on ref_id/ticker/date/qty/price, flag mismatches), create `reconciliation_flags` for new mismatches
  - Write integration test: 5 transactions with one mismatch → 1 new flag, 4 reconciled

- [ ] 13. Build Activity Feed UI
  - Create `/app/activity` route (`src/routes/app.activity.tsx`)
  - Subscribe to `agent_jobs` and `transaction_versions` via Supabase Realtime for the current org
  - Render runs grouped by `run_id`: timestamp, trigger label, action count, policy tier badges, "Revert run" button (calls `revertRun`, optimistic update)
  - STOP-tier items show Approve / Reject buttons that update `agent_approvals`
  - Add the route to the app nav with a badge showing pending STOP approvals
  - Write snapshot test for the run-group component

- [ ] 14. Build Review Inbox UI
  - Create `/app/review` route (`src/routes/app.review.tsx`)
  - Load `agent_approvals` where `status = 'pending'` and `policy_tier = 'REVIEW'` for the org
  - Render each item: field name, extracted value, confidence bar, source doc snippet, Approve / Skip / Reject actions
  - Approve: call `/api/agent/approve`, apply the change, mark approval row `approved`
  - Add badge count to nav
  - Write snapshot test for the inbox item component

---

## Phase 3: Excel/Graph Connector, Email Ingestion, Scheduled Tax Run, Settings

- [ ] 15. Create `connected_sources` table and settings UI tab
  - Apply migration for `connected_sources` and `notification_prefs` tables
  - Add "Connected Sources" tab to `/app/settings`
  - UI: list connected sources with status, last sync time, pause/resume toggle, delete button, per-source rule editor (confidence override, closed-period lock)
  - Pausing sets `paused = true`; deleting clears oauth token and removes the row

- [ ] 16. Implement Google OAuth flow for Sheets connection
  - Create `/api/auth/google/start` route: redirect to Google OAuth consent screen with `drive.readonly` scope
  - Create `/api/auth/google/callback` route: exchange code for token, encrypt token using Supabase Vault, insert into `connected_sources`
  - Write integration test: callback with a valid code inserts a connected source row

- [ ] 17. Implement OneDrive / Microsoft Graph connector
  - Create `supabase/functions/graph-poller/index.ts` analogous to sheets-poller
  - Register a Graph change notification (subscription) on connect; fall back to polling on subscription expiry
  - Implement OAuth flow analogous to Google Sheets
  - Write integration test: polling detects a changed file and enqueues an ingestion job

- [ ] 18. Email inbox ingestion
  - Configure Supabase inbound email (or a simple POST webhook from an email forwarding service)
  - Create `/api/webhooks/email` route: parse multipart email, extract PDF/XLSX attachments, enqueue `upload` jobs for each attachment
  - Write unit test: email with two PDF attachments enqueues two upload jobs

- [ ] 19. Month-end tax run cron job
  - Apply pg_cron schedule for month-end FIFO run
  - Implement `handleMonthlyTaxRun(job)` in the runner: call `computeTax` (existing function, unmodified), insert result into `tax_computations`, post a NOTIFY notification
  - Write integration test: month-end trigger produces a new `tax_computations` row and a notification

- [ ] 20. Email notification Edge Function
  - Create `supabase/functions/send-notification/index.ts`
  - On insert to `notifications` with `severity = 'warning'` or user `notification_prefs.email_on_notify = true`: send email via configured provider (Resend or Supabase SMTP)
  - Write unit test: NOTIFY-tier event produces an outbound email call with the correct subject and body

---

## Phase 4: Agent Learning, Proactive Suggestions, Multi-Client

- [ ] 21. Learn from user approvals and rejections
  - After each approval/rejection in `agent_approvals`, update `org_policy_config.allowed_auto_actions` or thresholds if the pattern recurs ≥ 3 times
  - Implement `learnFromDecision(orgId, action, decision)` in a new `src/lib/policy-learner.ts`
  - Write unit test: 3 consecutive approvals of `flag_anomaly` below-threshold confidence raises the auto threshold

- [ ] 22. Proactive tax-loss harvesting suggestions
  - Run `suggestHarvesting` (existing function in `tax.ts`) as part of the nightly reconciliation job
  - If new suggestions differ from existing `tax_loss_harvest_suggestions` rows, insert new rows and post a NOTIFY notification
  - Write integration test: harvesting suggestions appear in `tax_loss_harvest_suggestions` after a nightly run with unrealized losses

- [ ] 23. Update landing page copy
  - Edit `src/routes/index.tsx` hero section: replace confirmation-focused copy with "Acts on your data. Every change is traceable and reversible."
  - Add three feature cards: "Continuous monitoring", "Activity feed with one-click revert", "Review inbox for anything uncertain"
  - Remove or demote copy implying the AI asks before writing

- [ ] 24. Enterprise multi-client support
  - Allow Enterprise orgs to manage multiple child orgs (portfolio manager use case)
  - Add `parent_org_id` nullable FK to `organizations`
  - Extend the Activity Feed and Review Inbox to show a client selector dropdown for Enterprise users
  - Update `org_feature_flags` to reflect the plan limit check for multi-client access
