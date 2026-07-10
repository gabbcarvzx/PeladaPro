-- ==========================================
-- PeladaPro - Fix getById RLS: RPCs Leitura
-- ==========================================
-- CORRIGE: getById() e getUserPeladas() usam queries
-- diretas que passam pelo RLS, podendo falhar para
-- participantes recém-adicionados.
--
-- SOLUÇÃO: RPCs security definer que bypassam RLS
-- para leitura de peladas por ID.
-- ==========================================

-- 1. Função para buscar pelada por ID (security definer, bypassa RLS)
-- Mesmo padrão de buscar_por_invite_code
create or replace function public.buscar_por_id(p_pelada_id uuid)
returns public.peladas
language plpgsql security definer
as $$
declare
  v_result public.peladas;
begin
  select * into v_result
  from public.peladas
  where id = p_pelada_id;

  return v_result;
end;
$$;

-- 2. Função para buscar múltiplas peladas por IDs (security definer, bypassa RLS)
-- Usado pelo dashboard para listar peladas do usuário
create or replace function public.buscar_por_ids(p_pelada_ids uuid[])
returns setof public.peladas
language plpgsql security definer
as $$
begin
  return query
  select *
  from public.peladas
  where id = any(p_pelada_ids)
  order by created_at desc;
end;
$$;
