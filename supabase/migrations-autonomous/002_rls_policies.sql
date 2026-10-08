-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Row Level Security for new autonomous-agent tables
--
-- FIX: Postgres forbids set-returning functions (SRFs) inside policy
-- expressions.  current_org_ids() is an SRF, so we replace every usage with
-- a correlated EXISTS against public.profiles instead.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.org_policy_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_feature_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs    ENABLE ROW LEVEL SECURITY;

-- ── Helper macro: "caller belongs to this org" ───────────────────────────────
-- We inline an EXISTS rather than calling current_org_ids() to stay SRF-free.

-- ── org_policy_config ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_policy_config_select" ON public.org_policy_config;
CREATE POLICY "org_policy_config_select"
  ON public.org_policy_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = org_policy_config.org_id
    )
  );

DROP POLICY IF EXISTS "org_policy_config_insert" ON public.org_policy_config;
CREATE POLICY "org_policy_config_insert"
  ON public.org_policy_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = org_policy_config.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "org_policy_config_update" ON public.org_policy_config;
CREATE POLICY "org_policy_config_update"
  ON public.org_policy_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = org_policy_config.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- ── org_feature_flags ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_feature_flags_select" ON public.org_feature_flags;
CREATE POLICY "org_feature_flags_select"
  ON public.org_feature_flags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = org_feature_flags.org_id
    )
  );

-- Service role handles inserts (backfill + provisioning) — no user-facing INSERT policy.

-- ── agent_jobs ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "agent_jobs_select" ON public.agent_jobs;
CREATE POLICY "agent_jobs_select"
  ON public.agent_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = agent_jobs.org_id
    )
  );

DROP POLICY IF EXISTS "agent_jobs_insert" ON public.agent_jobs;
CREATE POLICY "agent_jobs_insert"
  ON public.agent_jobs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = agent_jobs.org_id
    )
  );

-- ── transaction_versions ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "txv_select" ON public.transaction_versions;
CREATE POLICY "txv_select"
  ON public.transaction_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = transaction_versions.org_id
    )
  );

-- Writes come only from the service role (Edge Functions) — no user INSERT policy.

-- ── agent_approvals ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "approvals_select" ON public.agent_approvals;
CREATE POLICY "approvals_select"
  ON public.agent_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = agent_approvals.org_id
    )
  );

DROP POLICY IF EXISTS "approvals_update" ON public.agent_approvals;
CREATE POLICY "approvals_update"
  ON public.agent_approvals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = agent_approvals.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- ── connected_sources ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "connected_sources_select" ON public.connected_sources;
CREATE POLICY "connected_sources_select"
  ON public.connected_sources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = connected_sources.org_id
    )
  );

DROP POLICY IF EXISTS "connected_sources_insert" ON public.connected_sources;
CREATE POLICY "connected_sources_insert"
  ON public.connected_sources
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = connected_sources.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "connected_sources_update" ON public.connected_sources;
CREATE POLICY "connected_sources_update"
  ON public.connected_sources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = connected_sources.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "connected_sources_delete" ON public.connected_sources;
CREATE POLICY "connected_sources_delete"
  ON public.connected_sources
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.org_id  = connected_sources.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- ── notification_prefs ────────────────────────────────────────────────────────
-- Only the owning user can read or write their own prefs.

DROP POLICY IF EXISTS "notif_prefs_own" ON public.notification_prefs;
CREATE POLICY "notif_prefs_own"
  ON public.notification_prefs
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
