-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Scheduled job seeding (pg_cron-FREE version)
--
-- pg_cron requires the Supabase Pro plan and the pg_cron extension.
-- This project is on Free/standard tier, so cron schedules are driven instead
-- by the Edge Function scheduler built into Supabase (no extra plan needed)
-- and by a lightweight heartbeat called from the React app on page load.
--
-- What this migration does instead:
--   1. Creates a helper view that the heartbeat API route queries to decide
--      whether a nightly or monthly job is already enqueued for today.
--   2. Creates the `schedule_heartbeat` function that inserts jobs safely
--      (idempotent — uses ON CONFLICT DO NOTHING on idempotency_key).
--   3. The actual schedule is enforced in:
--        src/routes/api/agent/heartbeat.ts   (called on app load)
--        supabase/functions/agent-runner/index.ts  (processes the jobs)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── View: which orgs need a nightly job today ─────────────────────────────────
CREATE OR REPLACE VIEW public.orgs_needing_nightly AS
SELECT o.id AS org_id
FROM   public.organizations o
JOIN   public.org_feature_flags f ON f.org_id = o.id
WHERE  f.autonomous_agent = TRUE
  AND  NOT EXISTS (
         SELECT 1 FROM public.agent_jobs j
         WHERE  j.org_id          = o.id
           AND  j.trigger_type    = 'cron_nightly'
           AND  j.idempotency_key = 'nightly:' || o.id::TEXT || ':' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
       );

-- ── View: which orgs need a monthly job this month ────────────────────────────
CREATE OR REPLACE VIEW public.orgs_needing_monthly AS
SELECT o.id AS org_id
FROM   public.organizations o
JOIN   public.org_feature_flags f ON f.org_id = o.id
WHERE  f.autonomous_agent = TRUE
  AND  NOT EXISTS (
         SELECT 1 FROM public.agent_jobs j
         WHERE  j.org_id          = o.id
           AND  j.trigger_type    = 'cron_monthly'
           AND  j.idempotency_key = 'monthly:' || o.id::TEXT || ':' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM')
       );

-- ── schedule_heartbeat: idempotently enqueue due jobs ─────────────────────────
-- Called from the API heartbeat route (no pg_cron required).
CREATE OR REPLACE FUNCTION public.schedule_heartbeat()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nightly_count INT := 0;
  v_monthly_count INT := 0;
  v_today         TEXT := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_month         TEXT := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_hour          INT  := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::INT;
  v_last_day      BOOL := (DATE_TRUNC('month', NOW() + INTERVAL '1 day') <> DATE_TRUNC('month', NOW()));
BEGIN
  -- Nightly jobs: only enqueue between 01:00 and 02:00 UTC
  IF v_hour = 1 THEN
    INSERT INTO public.agent_jobs (org_id, trigger_type, idempotency_key)
    SELECT org_id, 'cron_nightly', 'nightly:' || org_id::TEXT || ':' || v_today
    FROM   public.orgs_needing_nightly
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_nightly_count = ROW_COUNT;
  END IF;

  -- Monthly jobs: only enqueue on the last day of the month, between 23:00 and 00:00 UTC
  IF v_last_day AND v_hour = 23 THEN
    INSERT INTO public.agent_jobs (org_id, trigger_type, idempotency_key)
    SELECT org_id, 'cron_monthly', 'monthly:' || org_id::TEXT || ':' || v_month
    FROM   public.orgs_needing_monthly
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_monthly_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'nightly_enqueued', v_nightly_count,
    'monthly_enqueued', v_monthly_count,
    'checked_at',       NOW()
  );
END;
$$;

-- Grant execution to authenticated users (the heartbeat API route is auth-gated)
GRANT EXECUTE ON FUNCTION public.schedule_heartbeat() TO authenticated;
