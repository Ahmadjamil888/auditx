-- ─── AuditX: Create missing tables ──────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. financial_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  severity     text NOT NULL DEFAULT 'INFO',       -- CRITICAL | HIGH | MEDIUM | LOW | INFO | SUCCESS
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  entity_type  text,
  entity_id    text,
  metadata     jsonb,
  confidence   numeric NOT NULL DEFAULT 1.0,
  status       text NOT NULL DEFAULT 'OPEN',       -- OPEN | RESOLVED | ACKNOWLEDGED
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS financial_events_org_id_idx
  ON public.financial_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS financial_events_status_idx
  ON public.financial_events (org_id, status);

-- RLS
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_financial_events" ON public.financial_events;
CREATE POLICY "org_members_select_financial_events"
  ON public.financial_events FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_insert_financial_events" ON public.financial_events;
CREATE POLICY "org_members_insert_financial_events"
  ON public.financial_events FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_update_financial_events" ON public.financial_events;
CREATE POLICY "org_members_update_financial_events"
  ON public.financial_events FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. financial_insights
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_insights (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  insight_type  text NOT NULL,
  severity      text NOT NULL DEFAULT 'INFO',      -- CRITICAL | HIGH | MEDIUM | LOW | INFO | SUCCESS
  title         text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  confidence    numeric NOT NULL DEFAULT 1.0,
  evidence_ids  text[],
  entity_ids    text[],
  status        text NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE | RESOLVED | DISMISSED
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  resolved_at   timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS financial_insights_org_status_idx
  ON public.financial_insights (org_id, status, created_at DESC);

-- RLS
ALTER TABLE public.financial_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_financial_insights" ON public.financial_insights;
CREATE POLICY "org_members_select_financial_insights"
  ON public.financial_insights FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_insert_financial_insights" ON public.financial_insights;
CREATE POLICY "org_members_insert_financial_insights"
  ON public.financial_insights FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_update_financial_insights" ON public.financial_insights;
CREATE POLICY "org_members_update_financial_insights"
  ON public.financial_insights FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. financial_investigations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_investigations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL,
  title                   text NOT NULL,
  investigation_type      text NOT NULL,           -- PORTFOLIO | TAX | BROKER | TRANSACTIONS | ANOMALIES
  status                  text NOT NULL DEFAULT 'RUNNING',  -- RUNNING | COMPLETED | FAILED
  scope                   jsonb,
  findings                jsonb,
  summary                 text,
  transactions_analysed   integer NOT NULL DEFAULT 0,
  documents_analysed      integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS financial_investigations_org_id_idx
  ON public.financial_investigations (org_id, created_at DESC);

-- RLS
ALTER TABLE public.financial_investigations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_financial_investigations" ON public.financial_investigations;
CREATE POLICY "org_members_select_financial_investigations"
  ON public.financial_investigations FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_insert_financial_investigations" ON public.financial_investigations;
CREATE POLICY "org_members_insert_financial_investigations"
  ON public.financial_investigations FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_update_financial_investigations" ON public.financial_investigations;
CREATE POLICY "org_members_update_financial_investigations"
  ON public.financial_investigations FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────────────────────
