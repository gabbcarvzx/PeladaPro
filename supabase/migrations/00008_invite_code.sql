-- ==========================================
-- PeladaPro - Invite Code para links de convite
-- ==========================================
-- Adiciona invite_code como alias público do link_convite.
-- Execute APÓS 00007_ocorrencia_operacional.sql.
-- ==========================================

-- 1. ADICIONAR COLUNAS
alter table public.peladas
  add column if not exists invite_code text;

alter table public.peladas
  add column if not exists is_public boolean not null default true;

-- 2. BACKFILL: Copia link_convite para invite_code nos registros existentes
update public.peladas
  set invite_code = link_convite
  where invite_code is null;

-- 3. TORNAR NOT NULL E ÚNICO
alter table public.peladas
  alter column invite_code set not null;

create unique index if not exists idx_peladas_invite_code on public.peladas(invite_code);

-- 4. FUNÇÃO SEGURA: Buscar pelada por invite_code (security definer = bypassa RLS)
-- Isso permite que não-participantes vejam a pelada via link de convite
-- sem expor todas as peladas para qualquer usuário autenticado.
create or replace function public.buscar_por_invite_code(p_invite_code text)
returns public.peladas
language plpgsql security definer
as $$
declare
  v_result public.peladas;
begin
  select * into v_result
  from public.peladas
  where invite_code = p_invite_code;

  return v_result;
end;
$$;

-- Nota: A função gerar_link_convite só gera o texto, então não precisa mudar.
-- O invite_code será populado no insert via aplicação.
