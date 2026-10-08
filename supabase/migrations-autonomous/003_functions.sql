-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Postgres functions for the agent
-- ─────────────────────────────────────────────────────────────────────────────

-- ── dequeue_agent_job ─────────────────────────────────────────────────────────
-- Called by the Edge Function runner. Returns one pending job and locks it.
CREATE OR REPLACE FUNCTION public.dequeue_agent_job(p_worker_id TEXT DEFAULT 'default')
RETURNS public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.agent_jobs;
  v_run_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_job
  FROM public.agent_jobs
  WHERE status = 'pending'
    AND next_run_at <= NOW()
  ORDER BY next_run_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.agent_jobs
  SET status        = 'running',
      run_id        = v_run_id,
      attempt_count = attempt_count + 1,
      updated_at    = NOW()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- ── complete_agent_job ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_agent_job(
  p_job_id       UUID,
  p_status       TEXT,     -- done | failed | failed_invariant | dead_letter
  p_error        TEXT DEFAULT NULL,
  p_result       JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agent_jobs
  SET status         = p_status,
      error_message  = p_error,
      result_summary = p_result,
      updated_at     = NOW()
  WHERE id = p_job_id;
END;
$$;

-- ── retry_agent_job ───────────────────────────────────────────────────────────
-- Back-off retry: next_run_at = now + (attempt^2 * 30s)
CREATE OR REPLACE FUNCTION public.retry_agent_job(
  p_job_id      UUID,
  p_error       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempts INT;
  v_max      INT;
BEGIN
  SELECT attempt_count, max_attempts INTO v_attempts, v_max
  FROM public.agent_jobs WHERE id = p_job_id;

  IF v_attempts >= v_max THEN
    UPDATE public.agent_jobs
    SET status        = 'dead_letter',
        error_message = p_error,
        updated_at    = NOW()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.agent_jobs
    SET status        = 'pending',
        error_message = p_error,
        next_run_at   = NOW() + (v_attempts * v_attempts * INTERVAL '30 seconds'),
        updated_at    = NOW()
    WHERE id = p_job_id;
  END IF;
END;
$$;

-- ── revert_run ────────────────────────────────────────────────────────────────
-- Atomically restores all transaction_versions for a given run.
-- Each reversion itself creates a new version row tagged revert_of.
CREATE OR REPLACE FUNCTION public.revert_run(p_run_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ver     RECORD;
  v_count   INT := 0;
  v_new_ver UUID;
BEGIN
  -- Walk versions in reverse order (latest first) so nested edits unwind correctly
  FOR v_ver IN
    SELECT *
    FROM public.transaction_versions
    WHERE run_id = p_run_id
    ORDER BY created_at DESC
  LOOP
    -- Insert a new version row recording the revert
    INSERT INTO public.transaction_versions
      (transaction_id, org_id, run_id, snapshot, policy_tier, source_provenance, revert_of)
    VALUES
      (v_ver.transaction_id, v_ver.org_id, p_run_id,
       v_ver.snapshot,    -- snapshot of the reverted-to state
       v_ver.policy_tier,
       jsonb_build_object('revert_of_run', p_run_id, 'revert_at', NOW()),
       v_ver.id)
    RETURNING id INTO v_new_ver;

    -- Restore the live row from the snapshot
    UPDATE public.transactions
    SET
      ticker           = (v_ver.snapshot->>'ticker'),
      action           = (v_ver.snapshot->>'action'),
      quantity         = (v_ver.snapshot->>'quantity')::NUMERIC,
      price            = (v_ver.snapshot->>'price')::NUMERIC,
      fees             = (v_ver.snapshot->>'fees')::NUMERIC,
      wht              = (v_ver.snapshot->>'wht')::NUMERIC,
      trade_date       = (v_ver.snapshot->>'trade_date')::DATE,
      ref_id           = (v_ver.snapshot->>'ref_id'),
      broker           = (v_ver.snapshot->>'broker'),
      exchange         = (v_ver.snapshot->>'exchange'),
      confidence_score = (v_ver.snapshot->>'confidence_score')::NUMERIC,
      status           = (v_ver.snapshot->>'status'),
      source           = (v_ver.snapshot->'source')
    WHERE id = v_ver.transaction_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── enqueue_cron_jobs ─────────────────────────────────────────────────────────
-- Called by pg_cron or the scheduled Edge Function trigger.
CREATE OR REPLACE FUNCTION public.enqueue_nightly_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO public.agent_jobs (org_id, trigger_type, idempotency_key)
  SELECT
    o.id,
    'cron_nightly',
    'nightly:' || o.id::TEXT || ':' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  FROM public.organizations o
  JOIN public.org_feature_flags f ON f.org_id = o.id
  WHERE f.autonomous_agent = TRUE
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_monthly_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  -- Only run on last day of month
  IF DATE_TRUNC('month', NOW() + INTERVAL '1 day') = DATE_TRUNC('month', NOW()) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.agent_jobs (org_id, trigger_type, idempotency_key)
  SELECT
    o.id,
    'cron_monthly',
    'monthly:' || o.id::TEXT || ':' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM')
  FROM public.organizations o
  JOIN public.org_feature_flags f ON f.org_id = o.id
  WHERE f.autonomous_agent = TRUE
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── provision_current_user: extend to create flag + policy rows ───────────────
-- We override the existing function to also insert default rows.
-- If the RPC already exists with a different signature this is additive only.
CREATE OR REPLACE FUNCTION public.provision_current_user(
  _org_name    TEXT,
  _full_name   TEXT,
  _jurisdiction TEXT DEFAULT 'PSX'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id  UUID;
  v_profile public.profiles;
BEGIN
  -- Create org
  INSERT INTO public.organizations (name, jurisdiction_default)
  VALUES (_org_name, _jurisdiction)
  RETURNING id INTO v_org_id;

  -- Create profile
  INSERT INTO public.profiles (org_id, user_id, full_name, role)
  VALUES (v_org_id, auth.uid(), _full_name, 'owner')
  RETURNING * INTO v_profile;

  -- Create free subscription
  INSERT INTO public.subscriptions (org_id, plan, status)
  VALUES (v_org_id, 'free', 'active')
  ON CONFLICT (org_id) DO NOTHING;

  -- Create default feature flags (free = no autonomous mode)
  INSERT INTO public.org_feature_flags (org_id, autonomous_agent, max_connected_sources)
  VALUES (v_org_id, FALSE, 0)
  ON CONFLICT (org_id) DO NOTHING;

  -- Create default policy config
  INSERT INTO public.org_policy_config (org_id)
  VALUES (v_org_id)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN v_profile;
END;
$$;
