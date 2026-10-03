
create extension if not exists "uuid-ossp";

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  jurisdiction_default text not null default 'PSX',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique,
  full_name text not null default '',
  role text not null default 'owner' check (role in ('owner','admin','analyst','viewer')),
  created_at timestamptz not null default now()
);
create table public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  jurisdiction text not null,
  filer_status text not null default 'Filer',
  cgt_rules jsonb not null default '{}', wht_rules jsonb not null default '{}', holding_period_tiers jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, broker_name text not null,
  currency text not null default 'PKR', exchange text not null default 'PSX', external_ref text,
  created_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  broker_account_id uuid references public.broker_accounts(id) on delete set null,
  storage_path text not null,
  doc_type text not null default 'trade_confirmation',
  status text not null default 'uploading' check (status in ('uploading','processing','done','failed')),
  extracted_data jsonb, confidence_score numeric,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  broker_account_id uuid references public.broker_accounts(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  ticker text not null,
  action text not null check (action in ('BUY','SELL','DIV')),
  quantity numeric not null, price numeric not null,
  fees numeric not null default 0, wht numeric not null default 0,
  trade_date date not null, ref_id text not null default '',
  confidence_score numeric not null default 1.0,
  status text not null default 'posted' check (status in ('posted','needs_review')),
  exchange text not null default 'PSX', broker text not null default '',
  source jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  broker_account_id uuid references public.broker_accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  entry_type text not null, amount numeric not null, balance_after numeric not null default 0,
  created_at timestamptz not null default now()
);
create table public.reconciliation_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  broker_account_id uuid references public.broker_accounts(id) on delete set null,
  flag_type text not null,
  severity text not null default 'warn' check (severity in ('ok','warn','bad')),
  ticker text not null default '', ref_id text not null default '',
  expected jsonb not null default '{}', actual jsonb not null default '{}',
  description text not null default '', suggested_resolution text not null default '',
  status text not null default 'open' check (status in ('open','resolved','expected')),
  created_at timestamptz not null default now()
);
create table public.tax_computations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  tax_profile_id uuid references public.tax_profiles(id) on delete set null,
  tax_year text not null, jurisdiction text not null default 'PSX', filer_status text not null default 'Filer',
  short_term_gain numeric not null default 0, long_term_gain numeric not null default 0,
  dividend_wht numeric not null default 0, estimated_tax_due numeric not null default 0,
  breakdown jsonb not null default '{}', computed_at timestamptz not null default now()
);
create table public.tax_loss_harvest_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  position_ticker text not null, exchange text not null default 'PSX',
  unrealized_loss numeric not null, potential_offset numeric not null,
  holding_days integer not null default 0, rationale text not null default '',
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor text not null, action text not null, entity_type text not null, entity_id text not null,
  payload jsonb not null default '{}', prev_hash text not null default '', hash text not null,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','enterprise')),
  status text not null default 'active',
  stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, type text not null, message text not null,
  read boolean not null default false, created_at timestamptz not null default now()
);
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, title text not null default 'New audit',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, ai_message_id text not null,
  role text not null check (role in ('user','assistant','system')),
  parts jsonb not null default '[]', position integer not null,
  created_at timestamptz not null default now(),
  unique (thread_id, ai_message_id)
);
create table public.financial_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null, severity text not null default 'info', title text not null, description text not null,
  entity_type text, entity_id text, metadata jsonb, confidence numeric not null default 1,
  status text not null default 'open', created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.financial_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  insight_type text not null, severity text not null default 'info', title text not null, summary text not null,
  confidence numeric not null default 1, evidence_ids text[], entity_ids text[],
  status text not null default 'active', created_at timestamptz not null default now(),
  expires_at timestamptz, resolved_at timestamptz
);
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, org_id uuid not null references public.organizations(id) on delete cascade,
  plan text not null default 'free', thread_id uuid, model text not null default '',
  inference_requests integer not null default 0, credits_used numeric not null default 0,
  status text not null default 'ok', provider_error text, created_at timestamptz not null default now()
);
create table public.financial_investigations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, title text not null, investigation_type text not null,
  status text not null default 'running', scope jsonb, findings jsonb, summary text,
  transactions_analysed integer not null default 0, documents_analysed integer not null default 0,
  created_at timestamptz not null default now(), completed_at timestamptz
);

create index on public.transactions(org_id, trade_date desc);
create index on public.reconciliation_flags(org_id, status);
create index on public.chat_threads(user_id, updated_at desc);
create index on public.chat_messages(thread_id, position);
create index on public.audit_log(org_id, created_at desc);
create index on public.notifications(user_id, created_at desc);

-- Org membership helper (security definer avoids recursive RLS)
create or replace function public.current_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where user_id = auth.uid()
$$;

-- Grants, RLS, org-scoped policies
do $$
declare t text;
begin
  foreach t in array array['organizations','profiles','tax_profiles','broker_accounts','documents','transactions',
    'ledger_entries','reconciliation_flags','tax_computations','tax_loss_harvest_suggestions','audit_log',
    'subscriptions','notifications','chat_threads','chat_messages','financial_events','financial_insights',
    'ai_usage','financial_investigations'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['tax_profiles','broker_accounts','documents','transactions','ledger_entries',
    'reconciliation_flags','tax_computations','tax_loss_harvest_suggestions','financial_events','financial_insights'] loop
    execute format('create policy "org members manage" on public.%I for all to authenticated using (org_id in (select public.current_org_ids())) with check (org_id in (select public.current_org_ids()))', t);
  end loop;
  foreach t in array array['notifications','chat_threads','chat_messages','ai_usage','financial_investigations'] loop
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid() and org_id in (select public.current_org_ids())) with check (user_id = auth.uid() and org_id in (select public.current_org_ids()))', t);
  end loop;
end $$;

create policy "members read org" on public.organizations for select to authenticated using (id in (select public.current_org_ids()));
create policy "owners update org" on public.organizations for update to authenticated using (id in (select public.current_org_ids())) with check (id in (select public.current_org_ids()));
create policy "read org profiles" on public.profiles for select to authenticated using (org_id in (select public.current_org_ids()));
create policy "update own profile" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id in (select public.current_org_ids()));
create policy "members read subscription" on public.subscriptions for select to authenticated using (org_id in (select public.current_org_ids()));
-- audit log is append-only
create policy "members read audit" on public.audit_log for select to authenticated using (org_id in (select public.current_org_ids()));
create policy "members append audit" on public.audit_log for insert to authenticated with check (org_id in (select public.current_org_ids()));
revoke update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;

-- First-login provisioning: org + owner profile + free plan
create or replace function public.provision_current_user(_org_name text, _full_name text, _jurisdiction text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; new_org uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into p from public.profiles where user_id = uid;
  if found then return p; end if;
  insert into public.organizations(name, jurisdiction_default)
    values (coalesce(nullif(_org_name,''),'My Organisation'), coalesce(nullif(_jurisdiction,''),'PSX'))
    returning id into new_org;
  insert into public.profiles(org_id, user_id, full_name, role)
    values (new_org, uid, coalesce(_full_name,''), 'owner') returning * into p;
  insert into public.subscriptions(org_id, plan, status) values (new_org, 'free', 'active');
  return p;
end $$;
revoke execute on function public.provision_current_user(text,text,text) from public, anon;
grant execute on function public.provision_current_user(text,text,text) to authenticated;
grant execute on function public.current_org_ids() to authenticated;
