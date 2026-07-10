-- ==========================================
-- PeladaPro - Fix Convite: RPCs Idempotentes
-- ==========================================
-- CORRIGE: RLS bloqueia getById() para não-participantes,
-- fazendo addParticipante() sempre retornar false.
--
-- SOLUÇÃO: RPCs security definer que bypassam RLS
-- e são idempotentes (não geram erro se já participa).
-- ==========================================

-- 1. Função para adicionar participante com verificação de capacidade
-- Retorna true se conseguiu (ou já era participante), false se lotada
create or replace function public.adicionar_participante(
  p_pelada_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql security definer
as $$
declare
  v_limite integer;
  v_count integer;
  v_exists boolean;
begin
  -- Idempotência: já é participante?
  select exists(
    select 1 from public.pelada_participantes
    where pelada_id = p_pelada_id and user_id = p_user_id
  ) into v_exists;

  if v_exists then
    return true; -- já está, sucesso silencioso
  end if;

  -- Busca limite de jogadores da pelada
  select limite_jogadores into v_limite
  from public.peladas
  where id = p_pelada_id;

  if v_limite is null then
    return false; -- pelada não encontrada
  end if;

  -- Conta participantes atuais
  select count(*) into v_count
  from public.pelada_participantes
  where pelada_id = p_pelada_id;

  -- Verifica capacidade
  if v_count >= v_limite then
    return false; -- pelada lotada
  end if;

  -- Insere participante
  insert into public.pelada_participantes (pelada_id, user_id)
  values (p_pelada_id, p_user_id);

  return true;
end;
$$;

-- 2. Função para adicionar membro SEM limite de vagas (usado quando pelada está lotada)
-- Idempotente: se já participa, retorna true sem erro
create or replace function public.adicionar_membro_sem_limite(
  p_pelada_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql security definer
as $$
begin
  -- Idempotência: já é participante?
  if exists(
    select 1 from public.pelada_participantes
    where pelada_id = p_pelada_id and user_id = p_user_id
  ) then
    return true; -- já está, sucesso silencioso
  end if;

  -- Insere sem verificar limite
  insert into public.pelada_participantes (pelada_id, user_id)
  values (p_pelada_id, p_user_id);

  return true;
end;
$$;

-- 3. Função para buscar pelada por link_convite (security definer, bypassa RLS)
-- Similar a buscar_por_invite_code mas para o campo link_convite
create or replace function public.buscar_por_link_convite(p_link text)
returns public.peladas
language plpgsql security definer
as $$
declare
  v_result public.peladas;
begin
  select * into v_result
  from public.peladas
  where link_convite = p_link;

  return v_result;
end;
$$;
