-- ─── AuditX: Enrich notifications table ─────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds title, link, severity, and metadata columns to existing notifications.
-- Safe to run multiple times.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS link       text,
  ADD COLUMN IF NOT EXISTS severity   text NOT NULL DEFAULT 'info',  -- info | success | warning | error
  ADD COLUMN IF NOT EXISTS metadata   jsonb;

-- Index for fast unread count lookups
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read, created_at DESC);

-- RLS (if not already enabled)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_notifications" ON public.notifications;
CREATE POLICY "user_select_notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_insert_notifications" ON public.notifications;
CREATE POLICY "user_insert_notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_update_notifications" ON public.notifications;
CREATE POLICY "user_update_notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Service-role bypass policy for server-side inserts (agent notifications)
DROP POLICY IF EXISTS "service_insert_notifications" ON public.notifications;
CREATE POLICY "service_insert_notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
