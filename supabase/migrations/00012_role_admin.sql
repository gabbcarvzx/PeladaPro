-- =============================================
-- Migration 00012: Sistema de Roles (Admin/User)
-- =============================================
-- Remove dependência de pagamento. Administradores
-- são definidos manualmente no banco via role='admin'.
-- =============================================

-- 1. Adiciona coluna role na tabela profiles
alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin'));

-- 2. Marca como admin todos os usuários que já criaram peladas
update public.profiles
set role = 'admin'
where id in (
  select distinct admin_id from public.peladas
);

-- 3. Índice para busca rápida por role
create index if not exists idx_profiles_role
  on public.profiles(role);

-- 4. Atualiza a função can_create_pelada para usar role
create or replace function public.can_create_pelada(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.role = 'admin'
  );
$$;

-- 5. Atualiza a função can_manage_pelada para usar role
create or replace function public.can_manage_pelada(p_user_id uuid, p_pelada_id uuid)
returns boolean
language sql
stable
as $$
  select
    (select admin_id from public.peladas where id = p_pelada_id) = p_user_id
    and exists (
      select 1 from public.profiles p
      where p.id = p_user_id
        and p.role = 'admin'
    );
$$;

-- 6. Remove funções de bloqueio (não são mais necessárias no modelo gratuito)
-- Mantidas por compatibilidade, mas sem efeito real
create or replace function public.block_creator_peladas(p_user_id uuid)
returns void
language plpgsql security definer
as $$
begin
  -- No-op: sistema gratuito não bloqueia peladas
end;
$$;

create or replace function public.unblock_creator_peladas(p_user_id uuid)
returns void
language plpgsql security definer
as $$
begin
  -- No-op: sistema gratuito não bloqueia peladas
end;
$$;
