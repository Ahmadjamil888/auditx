# AuditX Autonomous Agent — Migrations

Run these **in order** in the Supabase SQL editor or via the CLI.

## Run order

| File | What it does | Must run before |
|---|---|---|
| `001_agent_tables.sql` | Creates all new tables: `agent_jobs`, `transaction_versions`, `agent_approvals`, `connected_sources`, `org_policy_config`, `org_feature_flags`, `notification_prefs`. Extends `audit_log` with `run_id` + `policy_tier`. Backfills default rows for existing orgs. | Everything else |
| `002_rls_policies.sql` | Enables RLS and adds `EXISTS`-based policies for every new table. Uses `profiles` JOIN — no set-returning functions. | `001` |
| `003_functions.sql` | Postgres functions: `dequeue_agent_job`, `complete_agent_job`, `retry_agent_job`, `revert_run`, `enqueue_nightly_jobs`, `enqueue_monthly_jobs`. Also replaces `provision_current_user` to auto-create flag + policy rows on first login. | `001`, `002` |
| `004_cron_schedules.sql` | **pg_cron-FREE alternative.** Creates `schedule_heartbeat()` function + helper views. Called from the React app's `useAgentHeartbeat` hook on page load — no pg_cron extension required. | `003` |
| `005_storage_bucket.sql` | Creates the `documents` storage bucket (private, 50 MB limit) with RLS policies for org-scoped upload/read/delete. | `001`, `002` |

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste and run `001_agent_tables.sql`.
3. Paste and run `002_rls_policies.sql`.
4. Paste and run `003_functions.sql`.
5. Paste and run `004_cron_schedules.sql`.
6. Paste and run `005_storage_bucket.sql`.

## How to run (Supabase CLI)

```bash
# From project root
supabase db push --db-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" \
  supabase/migrations-autonomous/001_agent_tables.sql \
  supabase/migrations-autonomous/002_rls_policies.sql \
  supabase/migrations-autonomous/003_functions.sql \
  supabase/migrations-autonomous/004_cron_schedules.sql
```

Or copy each file's content into the SQL editor one at a time.

## Edge Functions — deploy order

```bash
supabase functions deploy agent-runner
supabase functions deploy sheets-poller
supabase functions deploy onedrive-poller
supabase functions deploy send-notification
```

## Required environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions + API routes | Service-level DB access for agent runner |
| `OPENROUTER_API_KEY` | Edge Functions | LLM calls in agent runner |
| `OPENROUTER_MODEL` | Edge Functions (optional) | Override model for reasoning tasks (default: `openai/gpt-4o`) |
| `RESEND_API_KEY` | `send-notification` Edge Fn | Email delivery |
| `FROM_EMAIL` | `send-notification` Edge Fn | Sender address (default: `noreply@auditx.app`) |
| `GOOGLE_CLIENT_ID` | API routes | Google OAuth for Sheets |
| `GOOGLE_CLIENT_SECRET` | API routes | Google OAuth for Sheets |
| `MICROSOFT_CLIENT_ID` | API routes | OneDrive OAuth |
| `MICROSOFT_CLIENT_SECRET` | API routes | OneDrive OAuth |
| `MICROSOFT_TENANT_ID` | API routes (optional) | Defaults to `common` |
| `EMAIL_WEBHOOK_SECRET` | API routes | Shared secret for email relay webhook |

## Supabase Storage

Create a **private** bucket named `documents`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
```

Add an RLS policy so org members can upload to their own folder:

```sql
CREATE POLICY "org_members_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.org_id::TEXT
    )
  );

CREATE POLICY "org_members_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.org_id::TEXT
    )
  );
```

## Enabling autonomous mode for an org

```sql
-- Replace <ORG_ID> with the UUID from the organizations table
UPDATE public.org_feature_flags
SET autonomous_agent      = TRUE,
    max_connected_sources = 3   -- Pro plan: 3, Enterprise: 999
WHERE org_id = '<ORG_ID>';
```

## Running tests

```bash
npm run test
# or for watch mode:
npm run test:watch
```

Tests cover: policy tier decisions, FIFO determinism, schema validation, invariant checks, idempotency keys, loop prevention, debounce, policy learning.
