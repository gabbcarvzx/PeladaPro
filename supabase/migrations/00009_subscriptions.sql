-- ==========================================
-- PeladaPro - Sistema de Assinatura SaaS
-- ==========================================
-- Execute APÓS 00008_invite_code.sql no SQL Editor do Supabase Dashboard.
-- ==========================================

-- 1. TABELA SUBSCRIPTIONS
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asaas_customer_id text,
  asaas_subscription_id text,
  status text not null default 'pending' check (status in ('active', 'past_due', 'canceled', 'expired', 'pending')),
  plan_price numeric not null default 30.00,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create trigger handle_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_status on public.subscriptions(status);

-- 2. TABELA PAYMENTS
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  asaas_payment_id text,
  amount numeric not null default 30.00,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'overdue', 'refunded')),
  due_date date,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_payments_user_id on public.payments(user_id);
create index idx_payments_subscription_id on public.payments(subscription_id);
create index idx_payments_asaas_payment_id on public.payments(asaas_payment_id);

-- 3. CAMPOS NOVOS EM PROFILES
alter table public.profiles
  add column if not exists asaas_customer_id text;

alter table public.profiles
  add column if not exists subscription_status text not null default 'none' check (subscription_status in ('none', 'active', 'past_due', 'canceled', 'expired', 'pending'));

alter table public.profiles
  add column if not exists subscription_grace_until timestamptz;

-- 4. CAMPOS NOVOS EM PELADAS
alter table public.peladas
  add column if not exists is_blocked boolean not null default false;

alter table public.peladas
  add column if not exists blocked_reason text;

alter table public.peladas
  add column if not exists blocked_at timestamptz;

-- 5. RLS - SUBSCRIPTIONS
alter table public.subscriptions enable row level security;

create policy "Usuário pode ver sua própria assinatura"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admin pode gerenciar assinaturas"
  on public.subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Admin pode atualizar sua assinatura"
  on public.subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. RLS - PAYMENTS
alter table public.payments enable row level security;

create policy "Usuário pode ver seus próprios pagamentos"
  on public.payments for select
  to authenticated
  using (auth.uid() = user_id);

-- 7. FUNÇÃO: Verificar se usuário pode gerenciar pelada
create or replace function public.can_manage_pelada(p_user_id uuid, p_pelada_id uuid)
returns boolean
language plpgsql security definer
as $$
declare
  v_is_admin boolean;
  v_is_blocked boolean;
  v_sub_status text;
  v_grace_until timestamptz;
begin
  -- Verifica se é admin da pelada
  select admin_id = p_user_id into v_is_admin
  from public.peladas
  where id = p_pelada_id;

  if not v_is_admin then
    return false;
  end if;

  -- Verifica se a pelada está bloqueada
  select is_blocked into v_is_blocked
  from public.peladas
  where id = p_pelada_id;

  if v_is_blocked then
    return false;
  end if;

  -- Verifica status da assinatura do usuário
  select subscription_status, subscription_grace_until
  into v_sub_status, v_grace_until
  from public.profiles
  where id = p_user_id;

  if v_sub_status = 'active' then
    return true;
  end if;

  if v_sub_status = 'past_due' and v_grace_until is not null and now() <= v_grace_until then
    return true;
  end if;

  return false;
end;
$$;

-- 8. FUNÇÃO: Verificar se usuário pode criar pelada
create or replace function public.can_create_pelada(p_user_id uuid)
returns boolean
language plpgsql security definer
as $$
declare
  v_sub_status text;
  v_grace_until timestamptz;
begin
  select subscription_status, subscription_grace_until
  into v_sub_status, v_grace_until
  from public.profiles
  where id = p_user_id;

  if v_sub_status = 'active' then
    return true;
  end if;

  if v_sub_status = 'past_due' and v_grace_until is not null and now() <= v_grace_until then
    return true;
  end if;

  return false;
end;
$$;

-- 9. FUNÇÃO: Bloquear todas as peladas de um criador
create or replace function public.block_creator_peladas(p_user_id uuid)
returns void
language plpgsql security definer
as $$
begin
  update public.peladas
  set is_blocked = true,
      blocked_reason = 'subscription_expired',
      blocked_at = now()
  where admin_id = p_user_id
    and is_blocked = false;
end;
$$;

-- 10. FUNÇÃO: Desbloquear todas as peladas de um criador
create or replace function public.unblock_creator_peladas(p_user_id uuid)
returns void
language plpgsql security definer
as $$
begin
  update public.peladas
  set is_blocked = false,
      blocked_reason = null,
      blocked_at = null
  where admin_id = p_user_id;
end;
$$;
