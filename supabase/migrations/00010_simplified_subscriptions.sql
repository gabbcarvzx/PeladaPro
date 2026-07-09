-- =============================================
-- Migration 00010: Simplified Subscription System
-- =============================================
-- Objetivo: Simplificar o controle de assinatura
-- usando apenas profiles.subscription_expires_at
-- sem depender de subscriptions do Asaas.
--
-- Fluxo novo:
-- Pagamento recebido → expires_at = now() + 30 dias
-- Bloqueio: now() > expires_at → block peladas
-- =============================================

-- 1. Adiciona coluna subscription_expires_at na tabela profiles
alter table public.profiles
  add column if not exists subscription_expires_at timestamptz;

-- 2. Atualiza a função can_create_pelada
-- Nova lógica: verifica expires_at diretamente
create or replace function public.can_create_pelada(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    case
      when p.subscription_status = 'active' and (p.subscription_expires_at is not null and p.subscription_expires_at > now()) then true
      when p.subscription_status = 'active' and p.subscription_expires_at is null then false
      when p.subscription_status = 'past_due' and (p.subscription_grace_until is not null and p.subscription_grace_until > now()) then true
      else false
    end
  from public.profiles p
  where p.id = p_user_id;
$$;

-- 3. Atualiza a função can_manage_pelada
create or replace function public.can_manage_pelada(p_user_id uuid, p_pelada_id uuid)
returns boolean
language sql
stable
as $$
  select
    (select admin_id from public.peladas where id = p_pelada_id) = p_user_id
    and (
      (select p.subscription_status from public.profiles p where p.id = p_user_id) = 'active'
      and (select p.subscription_expires_at from public.profiles p where p.id = p_user_id) is not null
      and (select p.subscription_expires_at from public.profiles p where p.id = p_user_id) > now()
    )
    and (
      select coalesce(is_blocked, false) from public.peladas where id = p_pelada_id
    ) = false;
$$;
