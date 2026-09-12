-- ─── AuditX: Ledger CRUD RLS ──────────────────────────────────────────────────
-- Ensures broker_accounts and ledger_entries have full CRUD RLS for org members.
-- Also adds broker_account_id + notes columns to transactions for richer manual entry.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. broker_accounts — full CRUD RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_broker_accounts" ON public.broker_accounts;
CREATE POLICY "org_members_select_broker_accounts"
  ON public.broker_accounts FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_insert_broker_accounts" ON public.broker_accounts;
CREATE POLICY "org_members_insert_broker_accounts"
  ON public.broker_accounts FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_update_broker_accounts" ON public.broker_accounts;
CREATE POLICY "org_members_update_broker_accounts"
  ON public.broker_accounts FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_delete_broker_accounts" ON public.broker_accounts;
CREATE POLICY "org_members_delete_broker_accounts"
  ON public.broker_accounts FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transactions — full CRUD RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_transactions" ON public.transactions;
CREATE POLICY "org_members_select_transactions"
  ON public.transactions FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_insert_transactions" ON public.transactions;
CREATE POLICY "org_members_insert_transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_update_transactions" ON public.transactions;
CREATE POLICY "org_members_update_transactions"
  ON public.transactions FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_delete_transactions" ON public.transactions;
CREATE POLICY "org_members_delete_transactions"
  ON public.transactions FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add optional notes column to transactions (for manual entry context)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS notes text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ledger_entries — full CRUD RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_ledger_entries" ON public.ledger_entries;
CREATE POLICY "org_members_select_ledger_entries"
  ON public.ledger_entries FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_insert_ledger_entries" ON public.ledger_entries;
CREATE POLICY "org_members_insert_ledger_entries"
  ON public.ledger_entries FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_update_ledger_entries" ON public.ledger_entries;
CREATE POLICY "org_members_update_ledger_entries"
  ON public.ledger_entries FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_delete_ledger_entries" ON public.ledger_entries;
CREATE POLICY "org_members_delete_ledger_entries"
  ON public.ledger_entries FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────────────────────
