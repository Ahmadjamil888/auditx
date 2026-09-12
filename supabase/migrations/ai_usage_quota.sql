-- ─── AuditX: AI Usage Quota System ──────────────────────────────────────────
-- Tracks AI inference consumption per user/org, independent of provider limits.
-- Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_usage — one row per inference request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan                text NOT NULL DEFAULT 'free',
  thread_id           uuid,
  model               text NOT NULL DEFAULT '',
  inference_requests  integer NOT NULL DEFAULT 1,   -- model calls in this turn
  credits_used        integer NOT NULL DEFAULT 1,   -- AuditX credits consumed
  status              text NOT NULL DEFAULT 'ok',   -- ok | quota_exceeded | provider_error
  provider_error      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_day_idx
  ON public.ai_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_org_idx
  ON public.ai_usage (org_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_ai_usage" ON public.ai_usage;
CREATE POLICY "user_select_ai_usage"
  ON public.ai_usage FOR SELECT
  USING (user_id = auth.uid());

-- Server-side inserts bypass RLS (agent runs as service role via anon key + JWT)
DROP POLICY IF EXISTS "user_insert_ai_usage" ON public.ai_usage;
CREATE POLICY "user_insert_ai_usage"
  ON public.ai_usage FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-plan daily limits (reference table, not RLS-protected)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_plan_limits (
  plan              text PRIMARY KEY,
  daily_credits     integer NOT NULL,   -- credits per day (rolling 24h)
  monthly_credits   integer NOT NULL,   -- credits per calendar month
  max_per_request   integer NOT NULL    -- max credits a single request can consume
);

-- Seed / upsert plan limits
INSERT INTO public.ai_plan_limits (plan, daily_credits, monthly_credits, max_per_request)
VALUES
  ('free',       20,    400,   5),
  ('pro',       100,   3000,  20),
  ('enterprise', 500,  15000,  50)
ON CONFLICT (plan) DO UPDATE
  SET daily_credits   = EXCLUDED.daily_credits,
      monthly_credits = EXCLUDED.monthly_credits,
      max_per_request = EXCLUDED.max_per_request;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper view: daily usage per user (last 24h rolling window)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.ai_usage_today AS
SELECT
  user_id,
  org_id,
  plan,
  SUM(credits_used)::integer AS credits_used_today,
  COUNT(*)::integer           AS requests_today
FROM public.ai_usage
WHERE created_at > now() - interval '24 hours'
  AND status = 'ok'
GROUP BY user_id, org_id, plan;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────────────────────
