-- ============================================================================
-- AUDITX — COMPLETE SUPABASE DATABASE RESET + REBUILD
-- ============================================================================
-- Run this entire script in:
-- Supabase Dashboard → SQL Editor → New Query
--
-- This script:
--   ✓ Completely rebuilds AuditX public tables
--   ✓ Removes old AuditX functions/triggers first
--   ✓ Recreates all tables before functions reference them
--   ✓ Enables RLS
--   ✓ Creates organization-scoped security policies
--   ✓ Creates automatic user provisioning
--   ✓ Creates/reuses private Storage bucket
--   ✓ Never directly deletes from storage.objects/storage.buckets
--   ✓ Uses a transaction so a failure does not leave a half-built schema
--
-- IMPORTANT:
--   Existing files in the trade-documents Storage bucket are preserved.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS public;

BEGIN;


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================================
-- 2. REMOVE OLD AUDITX AUTH TRIGGER
-- ============================================================================
--
-- auth.users belongs to Supabase Auth.
-- We only remove our own trigger.
-- ============================================================================

DO $$
BEGIN

    IF EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
          AND tgrelid = 'auth.users'::regclass
          AND NOT tgisinternal
    ) THEN

        DROP TRIGGER on_auth_user_created
        ON auth.users;

    END IF;

EXCEPTION
    WHEN undefined_table THEN
        NULL;
END
$$;


-- ============================================================================
-- 3. REMOVE OLD AUDITX FUNCTIONS
-- ============================================================================
--
-- Do this BEFORE dropping tables.
-- ============================================================================

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

DROP FUNCTION IF EXISTS public.user_org_ids() CASCADE;

DROP FUNCTION IF EXISTS public.user_role_in_org(uuid) CASCADE;


-- ============================================================================
-- 4. REMOVE OLD AUDITX TABLES
-- ============================================================================
--
-- These are all public application tables.
--
-- Supabase system schemas such as auth and storage are NOT dropped.
-- ============================================================================

DROP TABLE IF EXISTS public.notifications CASCADE;

DROP TABLE IF EXISTS public.subscriptions CASCADE;

DROP TABLE IF EXISTS public.audit_log CASCADE;

DROP TABLE IF EXISTS public.tax_loss_harvest_suggestions CASCADE;

DROP TABLE IF EXISTS public.tax_computations CASCADE;

DROP TABLE IF EXISTS public.reconciliation_flags CASCADE;

DROP TABLE IF EXISTS public.ledger_entries CASCADE;

DROP TABLE IF EXISTS public.transactions CASCADE;

DROP TABLE IF EXISTS public.documents CASCADE;

DROP TABLE IF EXISTS public.broker_accounts CASCADE;

DROP TABLE IF EXISTS public.tax_profiles CASCADE;

DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TABLE IF EXISTS public.organizations CASCADE;


-- ============================================================================
-- 5. REMOVE OLD AUDITX STORAGE POLICIES
-- ============================================================================
--
-- IMPORTANT:
-- We do NOT delete from storage.buckets.
-- We do NOT delete from storage.objects.
--
-- Supabase protects these tables from direct SQL deletion.
-- ============================================================================

DROP POLICY IF EXISTS "trade_documents_select"
ON storage.objects;

DROP POLICY IF EXISTS "trade_documents_insert"
ON storage.objects;

DROP POLICY IF EXISTS "trade_documents_update"
ON storage.objects;

DROP POLICY IF EXISTS "trade_documents_delete"
ON storage.objects;


-- ============================================================================
-- 6. ORGANIZATIONS
-- ============================================================================

CREATE TABLE public.organizations (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    name TEXT NOT NULL,

    jurisdiction_default TEXT NOT NULL
        DEFAULT 'PSX',

    logo_url TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX organizations_name_idx
ON public.organizations(name);


-- ============================================================================
-- 7. PROFILES
-- ============================================================================
--
-- IMPORTANT:
-- profiles is deliberately created BEFORE any function references it.
-- ============================================================================

CREATE TABLE public.profiles (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name TEXT NOT NULL
        DEFAULT '',

    role TEXT NOT NULL
        DEFAULT 'owner',

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT profiles_role_check
        CHECK (
            role IN (
                'owner',
                'admin',
                'analyst',
                'viewer'
            )
        ),

    CONSTRAINT profiles_org_user_unique
        UNIQUE(org_id, user_id)

);


CREATE INDEX profiles_user_id_idx
ON public.profiles(user_id);


CREATE INDEX profiles_org_id_idx
ON public.profiles(org_id);


-- ============================================================================
-- 8. TAX PROFILES
-- ============================================================================

CREATE TABLE public.tax_profiles (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    jurisdiction TEXT NOT NULL,

    filer_status TEXT NOT NULL
        DEFAULT 'Filer',

    cgt_rules JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    wht_rules JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    holding_period_tiers JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX tax_profiles_org_id_idx
ON public.tax_profiles(org_id);


-- ============================================================================
-- 9. BROKER ACCOUNTS
-- ============================================================================

CREATE TABLE public.broker_accounts (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    broker_name TEXT NOT NULL,

    currency TEXT NOT NULL
        DEFAULT 'PKR',

    exchange TEXT NOT NULL
        DEFAULT 'PSX',

    external_ref TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX broker_accounts_org_id_idx
ON public.broker_accounts(org_id);


-- ============================================================================
-- 10. DOCUMENTS
-- ============================================================================

CREATE TABLE public.documents (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    broker_account_id UUID
        REFERENCES public.broker_accounts(id)
        ON DELETE SET NULL,

    storage_path TEXT NOT NULL,

    doc_type TEXT NOT NULL
        DEFAULT 'trade_confirmation',

    status TEXT NOT NULL
        DEFAULT 'uploading',

    extracted_data JSONB,

    confidence_score NUMERIC(4,3),

    uploaded_by UUID NOT NULL
        REFERENCES auth.users(id),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT documents_status_check
        CHECK (
            status IN (
                'uploading',
                'processing',
                'done',
                'failed'
            )
        )

);


CREATE INDEX documents_org_id_idx
ON public.documents(org_id);


CREATE INDEX documents_status_idx
ON public.documents(status);


CREATE INDEX documents_broker_account_idx
ON public.documents(broker_account_id);


-- ============================================================================
-- 11. TRANSACTIONS
-- ============================================================================

CREATE TABLE public.transactions (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    broker_account_id UUID
        REFERENCES public.broker_accounts(id)
        ON DELETE SET NULL,

    document_id UUID
        REFERENCES public.documents(id)
        ON DELETE SET NULL,

    ticker TEXT NOT NULL,

    action TEXT NOT NULL,

    quantity NUMERIC NOT NULL,

    price NUMERIC NOT NULL,

    fees NUMERIC NOT NULL
        DEFAULT 0,

    wht NUMERIC NOT NULL
        DEFAULT 0,

    trade_date DATE NOT NULL,

    ref_id TEXT NOT NULL
        DEFAULT '',

    confidence_score NUMERIC(4,3) NOT NULL
        DEFAULT 1.0,

    status TEXT NOT NULL
        DEFAULT 'posted',

    exchange TEXT NOT NULL
        DEFAULT 'PSX',

    broker TEXT NOT NULL
        DEFAULT '',

    source JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT transactions_action_check
        CHECK (
            action IN (
                'BUY',
                'SELL',
                'DIV'
            )
        ),

    CONSTRAINT transactions_status_check
        CHECK (
            status IN (
                'posted',
                'needs_review'
            )
        )

);


CREATE INDEX transactions_org_id_idx
ON public.transactions(org_id);


CREATE INDEX transactions_ticker_idx
ON public.transactions(ticker);


CREATE INDEX transactions_trade_date_idx
ON public.transactions(trade_date);


CREATE INDEX transactions_status_idx
ON public.transactions(status);


CREATE INDEX transactions_broker_account_idx
ON public.transactions(broker_account_id);


CREATE INDEX transactions_document_idx
ON public.transactions(document_id);


-- ============================================================================
-- 12. LEDGER ENTRIES
-- ============================================================================

CREATE TABLE public.ledger_entries (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    broker_account_id UUID
        REFERENCES public.broker_accounts(id)
        ON DELETE SET NULL,

    transaction_id UUID
        REFERENCES public.transactions(id)
        ON DELETE CASCADE,

    entry_type TEXT NOT NULL,

    amount NUMERIC NOT NULL,

    balance_after NUMERIC NOT NULL
        DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX ledger_entries_org_id_idx
ON public.ledger_entries(org_id);


CREATE INDEX ledger_entries_transaction_id_idx
ON public.ledger_entries(transaction_id);


-- ============================================================================
-- 13. RECONCILIATION FLAGS
-- ============================================================================

CREATE TABLE public.reconciliation_flags (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    broker_account_id UUID
        REFERENCES public.broker_accounts(id)
        ON DELETE SET NULL,

    flag_type TEXT NOT NULL,

    severity TEXT NOT NULL
        DEFAULT 'warn',

    ticker TEXT NOT NULL
        DEFAULT '',

    ref_id TEXT NOT NULL
        DEFAULT '',

    expected JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    actual JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    description TEXT NOT NULL
        DEFAULT '',

    suggested_resolution TEXT NOT NULL
        DEFAULT '',

    status TEXT NOT NULL
        DEFAULT 'open',

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT reconciliation_severity_check
        CHECK (
            severity IN (
                'ok',
                'warn',
                'bad'
            )
        ),

    CONSTRAINT reconciliation_status_check
        CHECK (
            status IN (
                'open',
                'resolved',
                'expected'
            )
        )

);


CREATE INDEX reconciliation_flags_org_id_idx
ON public.reconciliation_flags(org_id);


CREATE INDEX reconciliation_flags_status_idx
ON public.reconciliation_flags(status);


CREATE INDEX reconciliation_flags_severity_idx
ON public.reconciliation_flags(severity);


-- ============================================================================
-- 14. TAX COMPUTATIONS
-- ============================================================================

CREATE TABLE public.tax_computations (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    tax_profile_id UUID
        REFERENCES public.tax_profiles(id)
        ON DELETE SET NULL,

    tax_year TEXT NOT NULL,

    jurisdiction TEXT NOT NULL
        DEFAULT 'PSX',

    filer_status TEXT NOT NULL
        DEFAULT 'Filer',

    short_term_gain NUMERIC NOT NULL
        DEFAULT 0,

    long_term_gain NUMERIC NOT NULL
        DEFAULT 0,

    dividend_wht NUMERIC NOT NULL
        DEFAULT 0,

    estimated_tax_due NUMERIC NOT NULL
        DEFAULT 0,

    breakdown JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    computed_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX tax_computations_org_id_idx
ON public.tax_computations(org_id);


CREATE INDEX tax_computations_year_idx
ON public.tax_computations(tax_year);


-- ============================================================================
-- 15. TAX LOSS HARVEST SUGGESTIONS
-- ============================================================================

CREATE TABLE public.tax_loss_harvest_suggestions (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    position_ticker TEXT NOT NULL,

    exchange TEXT NOT NULL
        DEFAULT 'PSX',

    unrealized_loss NUMERIC NOT NULL,

    potential_offset NUMERIC NOT NULL,

    holding_days INTEGER NOT NULL
        DEFAULT 0,

    rationale TEXT NOT NULL
        DEFAULT '',

    status TEXT NOT NULL
        DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT tax_loss_status_check
        CHECK (
            status IN (
                'pending',
                'applied',
                'dismissed'
            )
        )

);


CREATE INDEX tax_loss_harvest_org_id_idx
ON public.tax_loss_harvest_suggestions(org_id);


-- ============================================================================
-- 16. AUDIT LOG
-- ============================================================================

CREATE TABLE public.audit_log (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    actor TEXT NOT NULL,

    action TEXT NOT NULL,

    entity_type TEXT NOT NULL,

    entity_id TEXT NOT NULL,

    payload JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    prev_hash TEXT NOT NULL
        DEFAULT '',

    hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX audit_log_org_id_idx
ON public.audit_log(org_id);


CREATE INDEX audit_log_created_at_idx
ON public.audit_log(created_at DESC);


-- Prevent UPDATE / DELETE on audit log.

CREATE RULE audit_log_no_update
AS ON UPDATE TO public.audit_log
DO INSTEAD NOTHING;


CREATE RULE audit_log_no_delete
AS ON DELETE TO public.audit_log
DO INSTEAD NOTHING;


-- ============================================================================
-- 17. SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE public.subscriptions (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    plan TEXT NOT NULL
        DEFAULT 'free',

    status TEXT NOT NULL
        DEFAULT 'active',

    stripe_customer_id TEXT,

    stripe_subscription_id TEXT,

    current_period_end TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now(),

    CONSTRAINT subscriptions_plan_check
        CHECK (
            plan IN (
                'free',
                'pro',
                'enterprise'
            )
        ),

    CONSTRAINT subscriptions_org_unique
        UNIQUE(org_id)

);


CREATE INDEX subscriptions_org_id_idx
ON public.subscriptions(org_id);


-- ============================================================================
-- 18. NOTIFICATIONS
-- ============================================================================

CREATE TABLE public.notifications (

    id UUID PRIMARY KEY
        DEFAULT uuid_generate_v4(),

    org_id UUID NOT NULL
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    type TEXT NOT NULL,

    message TEXT NOT NULL,

    read BOOLEAN NOT NULL
        DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT now()

);


CREATE INDEX notifications_user_id_idx
ON public.notifications(user_id);


CREATE INDEX notifications_org_id_idx
ON public.notifications(org_id);


CREATE INDEX notifications_read_idx
ON public.notifications(read);


-- ============================================================================
-- 19. UPDATED_AT FUNCTION
-- ============================================================================
--
-- All required tables now exist.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    NEW.updated_at = now();

    RETURN NEW;

END;
$$;


CREATE TRIGGER organizations_updated_at
BEFORE UPDATE
ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();


-- ============================================================================
-- 20. USER ORGANIZATION HELPER
-- ============================================================================
--
-- profiles DEFINITELY exists at this point.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$

    SELECT org_id

    FROM public.profiles

    WHERE user_id = auth.uid();

$$;


-- ============================================================================
-- 21. USER ROLE HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_role_in_org(
    target_org UUID
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$

    SELECT role

    FROM public.profiles

    WHERE user_id = auth.uid()

      AND org_id = target_org

    LIMIT 1;

$$;


-- ============================================================================
-- 22. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.organizations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_profiles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.broker_accounts
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transactions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reconciliation_flags
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_computations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_loss_harvest_suggestions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications
ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 23. ORGANIZATION POLICIES
-- ============================================================================

CREATE POLICY "org_select"
ON public.organizations
FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT public.user_org_ids()
    )
);


CREATE POLICY "org_insert"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);


CREATE POLICY "org_update"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT public.user_org_ids()
    )

    AND public.user_role_in_org(id)
        IN ('owner', 'admin')
);


-- ============================================================================
-- 24. PROFILE POLICIES
-- ============================================================================

CREATE POLICY "profile_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    org_id IN (
        SELECT public.user_org_ids()
    )
);


CREATE POLICY "profile_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    org_id IN (
        SELECT public.user_org_ids()
    )
);


CREATE POLICY "profile_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    org_id IN (
        SELECT public.user_org_ids()
    )

    AND public.user_role_in_org(org_id)
        IN ('owner', 'admin')
);


-- ============================================================================
-- 25. GENERIC ORG-SCOPED POLICIES
-- ============================================================================

DO $$

DECLARE

    t TEXT;

BEGIN

    FOREACH t IN ARRAY ARRAY[
        'tax_profiles',
        'broker_accounts',
        'documents',
        'transactions',
        'ledger_entries',
        'reconciliation_flags',
        'tax_computations',
        'tax_loss_harvest_suggestions',
        'audit_log',
        'subscriptions'
    ]

    LOOP

        EXECUTE format(
            'CREATE POLICY "%s_select"
             ON public.%I
             FOR SELECT
             TO authenticated
             USING (
                 org_id IN (
                     SELECT public.user_org_ids()
                 )
             )',
            t,
            t
        );


        EXECUTE format(
            'CREATE POLICY "%s_insert"
             ON public.%I
             FOR INSERT
             TO authenticated
             WITH CHECK (
                 org_id IN (
                     SELECT public.user_org_ids()
                 )
             )',
            t,
            t
        );


        EXECUTE format(
            'CREATE POLICY "%s_update"
             ON public.%I
             FOR UPDATE
             TO authenticated
             USING (
                 org_id IN (
                     SELECT public.user_org_ids()
                 )

                 AND public.user_role_in_org(org_id)
                     IN (
                         ''owner'',
                         ''admin'',
                         ''analyst''
                     )
             )',
            t,
            t
        );


        EXECUTE format(
            'CREATE POLICY "%s_delete"
             ON public.%I
             FOR DELETE
             TO authenticated
             USING (
                 org_id IN (
                     SELECT public.user_org_ids()
                 )

                 AND public.user_role_in_org(org_id)
                     IN (
                         ''owner'',
                         ''admin''
                     )
             )',
            t,
            t
        );

    END LOOP;

END
$$;


-- ============================================================================
-- 26. NOTIFICATION POLICIES
-- ============================================================================

CREATE POLICY "notifications_select"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
);


CREATE POLICY "notifications_insert"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    org_id IN (
        SELECT public.user_org_ids()
    )
);


CREATE POLICY "notifications_update"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
);


CREATE POLICY "notifications_delete"
ON public.notifications
FOR DELETE
TO authenticated
USING (
    user_id = auth.uid()
);


-- ============================================================================
-- 27. AUTO-PROVISION NEW USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE

    v_org_id UUID;

    v_org_name TEXT;

    v_jurisdiction TEXT;

BEGIN

    v_org_name :=
        COALESCE(
            NEW.raw_user_meta_data ->> 'org_name',
            'My Organisation'
        );


    v_jurisdiction :=
        COALESCE(
            NEW.raw_user_meta_data ->> 'jurisdiction',
            'PSX'
        );


    -- Create organization

    INSERT INTO public.organizations (
        name,
        jurisdiction_default
    )

    VALUES (
        v_org_name,
        v_jurisdiction
    )

    RETURNING id
    INTO v_org_id;


    -- Create profile

    INSERT INTO public.profiles (
        org_id,
        user_id,
        full_name,
        role
    )

    VALUES (
        v_org_id,
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.email,
            ''
        ),
        'owner'
    );


    -- Create free subscription

    INSERT INTO public.subscriptions (
        org_id,
        plan,
        status
    )

    VALUES (
        v_org_id,
        'free',
        'active'
    );


    -- Create default tax profile

    INSERT INTO public.tax_profiles (
        org_id,
        jurisdiction,
        filer_status,
        cgt_rules,
        wht_rules,
        holding_period_tiers
    )

    VALUES (

        v_org_id,

        v_jurisdiction,

        'Filer',

        '{
            "short_term_rate": 0.15,
            "mid_term_rate": 0.125,
            "long_term_rate": 0.0,
            "short_threshold_days": 365,
            "mid_threshold_days": 730
        }'::jsonb,

        '{
            "filer_rate": 0.10,
            "non_filer_rate": 0.125
        }'::jsonb,

        '{
            "tiers": [
                {
                    "max_days": 365,
                    "label": "Short-term"
                },
                {
                    "max_days": 730,
                    "label": "Mid-term"
                },
                {
                    "max_days": null,
                    "label": "Long-term"
                }
            ]
        }'::jsonb

    );


    RETURN NEW;

END;

$$;


-- ============================================================================
-- 28. CREATE AUTH TRIGGER
-- ============================================================================

CREATE TRIGGER on_auth_user_created

AFTER INSERT

ON auth.users

FOR EACH ROW

EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 29. STORAGE BUCKET
-- ============================================================================
--
-- Reuse existing bucket.
-- Create it if missing.
--
-- NEVER DELETE FROM storage.buckets.
-- ============================================================================

INSERT INTO storage.buckets (
    id,
    name,
    public
)

VALUES (
    'trade-documents',
    'trade-documents',
    false
)

ON CONFLICT (id)

DO UPDATE SET
    public = false;


-- ============================================================================
-- 30. STORAGE POLICIES
-- ============================================================================

CREATE POLICY "trade_documents_select"

ON storage.objects

FOR SELECT

TO authenticated

USING (
    bucket_id = 'trade-documents'
);


CREATE POLICY "trade_documents_insert"

ON storage.objects

FOR INSERT

TO authenticated

WITH CHECK (
    bucket_id = 'trade-documents'
);


CREATE POLICY "trade_documents_update"

ON storage.objects

FOR UPDATE

TO authenticated

USING (
    bucket_id = 'trade-documents'
)

WITH CHECK (
    bucket_id = 'trade-documents'
);


CREATE POLICY "trade_documents_delete"

ON storage.objects

FOR DELETE

TO authenticated

USING (
    bucket_id = 'trade-documents'
);


-- ============================================================================
-- 31. VERIFICATION
-- ============================================================================

DO $$

DECLARE

    required_table TEXT;

    missing_count INTEGER;

BEGIN

    SELECT COUNT(*)

    INTO missing_count

    FROM (
        VALUES
            ('organizations'),
            ('profiles'),
            ('tax_profiles'),
            ('broker_accounts'),
            ('documents'),
            ('transactions'),
            ('ledger_entries'),
            ('reconciliation_flags'),
            ('tax_computations'),
            ('tax_loss_harvest_suggestions'),
            ('audit_log'),
            ('subscriptions'),
            ('notifications')
    ) AS required(table_name)

    WHERE NOT EXISTS (
        SELECT 1

        FROM information_schema.tables t

        WHERE t.table_schema = 'public'

          AND t.table_name = required.table_name
    );


    IF missing_count > 0 THEN

        RAISE EXCEPTION
            'AuditX verification failed: % required tables are missing.',
            missing_count;

    END IF;


    RAISE NOTICE
        'AuditX database verification successful.';

END
$$;


-- ============================================================================
-- 32. COMMIT
-- ============================================================================

COMMIT;


-- ============================================================================
-- 33. FINAL STATUS
-- ============================================================================

SELECT
    'AuditX schema successfully rebuilt' AS status;


SELECT
    table_name

FROM information_schema.tables

WHERE table_schema = 'public'

  AND table_name IN (
      'organizations',
      'profiles',
      'tax_profiles',
      'broker_accounts',
      'documents',
      'transactions',
      'ledger_entries',
      'reconciliation_flags',
      'tax_computations',
      'tax_loss_harvest_suggestions',
      'audit_log',
      'subscriptions',
      'notifications'
  )

ORDER BY table_name;


SELECT
    id,
    name,
    public

FROM storage.buckets

WHERE id = 'trade-documents';