-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Autonomous Agent Core Tables
-- Creates: agent_jobs, transaction_versions, agent_approvals, org_policy_config,
--          org_feature_flags, notification_prefs
-- Extends: audit_log with run_id + policy_tier
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extend audit_log (non-breaking — nullable columns) ───────────────────────
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS run_id      UUID,
  ADD COLUMN IF NOT EXISTS policy_tier TEXT;

-- ── Per-org policy configuration ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_policy_config (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  auto_fix_duplicate_under_amount NUMERIC,
  never_touch_closed_periods_before DATE,
  confidence_threshold_auto       NUMERIC NOT NULL DEFAULT 0.90,
  confidence_threshold_notify     NUMERIC NOT NULL DEFAULT 0.75,
  allowed_auto_actions            TEXT[]  NOT NULL DEFAULT ARRAY['flag_anomaly','run_fifo','categorize','remove_duplicate'],
  daily_token_budget              INT,
  daily_cost_budget_usd           NUMERIC,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Feature flags per org ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_feature_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  autonomous_agent      BOOLEAN NOT NULL DEFAULT FALSE,
  max_connected_sources INT     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Durable job queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type     TEXT NOT NULL,  -- upload|sheet_change|email|cron_nightly|cron_monthly|manual|ingestion
  trigger_payload  JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','done','failed','failed_invariant','dead_letter')),
  run_id           UUID,
  idempotency_key  TEXT NOT NULL UNIQUE,
  attempt_count    INT  NOT NULL DEFAULT 0,
  max_attempts     INT  NOT NULL DEFAULT 3,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message    TEXT,
  result_summary   JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_jobs_pending_idx
  ON public.agent_jobs (org_id, next_run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agent_jobs_run_id_idx
  ON public.agent_jobs (run_id);

-- ── Transaction version history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transaction_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id            UUID,
  snapshot          JSONB NOT NULL,
  policy_tier       TEXT  NOT NULL CHECK (policy_tier IN ('AUTO','NOTIFY','REVIEW','STOP')),
  source_provenance JSONB NOT NULL DEFAULT '{}',
  revert_of         UUID  REFERENCES public.transaction_versions(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS txv_by_run ON public.transaction_versions (run_id);
CREATE INDEX IF NOT EXISTS txv_by_tx  ON public.transaction_versions (transaction_id, created_at DESC);

-- ── Human approvals (STOP + REVIEW tier) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES public.agent_jobs(id) ON DELETE SET NULL,
  run_id          UUID,
  action_type     TEXT NOT NULL,
  action_payload  JSONB NOT NULL DEFAULT '{}',
  policy_tier     TEXT NOT NULL DEFAULT 'STOP'
                  CHECK (policy_tier IN ('REVIEW','STOP')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','skipped')),
  decided_by      UUID REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_pending_idx
  ON public.agent_approvals (org_id, status, policy_tier)
  WHERE status = 'pending';

-- ── Connected external sources ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connected_sources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type           TEXT NOT NULL
                        CHECK (source_type IN ('google_sheets','onedrive','email_inbox','folder')),
  external_id           TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  oauth_token_encrypted TEXT,
  last_etag             TEXT,
  last_hash             TEXT,
  watch_expiry          TIMESTAMPTZ,
  paused                BOOLEAN NOT NULL DEFAULT FALSE,
  rules                 JSONB   NOT NULL DEFAULT '{}',
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, source_type, external_id)
);

-- ── Notification preferences ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_notify     BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_auto    BOOLEAN NOT NULL DEFAULT FALSE,
  email_on_notify  BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_review  BOOLEAN NOT NULL DEFAULT TRUE,
  email_on_stop    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Back-fill default flag + policy rows for existing orgs ───────────────────
INSERT INTO public.org_feature_flags (org_id, autonomous_agent, max_connected_sources)
SELECT id, FALSE, 0 FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_policy_config (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;
