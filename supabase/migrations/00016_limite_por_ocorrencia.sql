-- ==========================================
-- PeladaPro - Limite por Ocorrência + Participantes Ilimitados
-- ==========================================
-- REGRA: Participantes são ilimitados na pelada.
--        Apenas 25 (configurável) podem confirmar por ocorrência.
--        Mensalistas SEMPRE entram (prioridade sobre diaristas).
--        Diaristas excedentes vão para fila de espera.
--        Tudo transactional com lock para evitar race condition.
-- ==========================================

-- 1. ADICIONA CAMPO limite_por_ocorrencia NA TABELA PELADAS
alter table public.peladas
  add column if not exists limite_por_ocorrencia integer not null default 25;

-- ==========================================
-- 2. ATUALIZA adicionar_participante — REMOVE VERIFICAÇÃO DE LIMITE
--    Participantes agora são ILIMITADOS.
--    Qualquer usuário pode virar membro fixo da pelada.
--    Idempotente: retorna true se já participa.
-- ==========================================
create or replace function public.adicionar_participante(
  p_pelada_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql security definer
as $$
declare
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

  -- Participantes são ILIMITADOS — insere sem verificar capacidade
  insert into public.pelada_participantes (pelada_id, user_id)
  values (p_pelada_id, p_user_id);

  return true;
end;
$$;

-- ==========================================
-- 3. RPC: confirmar_presenca_ocorrencia (TRANSACTIONAL)
--    Usa FOR UPDATE lock na ocorrência para evitar race condition.
--    Fluxo:
--      - Mensalista → sempre confirma (prioridade)
--      - Diarista + vagas → confirma
--      - Diarista + lotado → fila de espera (com prioridade mensalista)
-- ==========================================
create or replace function public.confirmar_presenca_ocorrencia(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_limite_por_ocorrencia integer;
  v_confirmados_count integer;
  v_tipo text;
  v_posicao integer;
  v_mensalistas_fila integer;
  v_diaristas_fila integer;
  v_lock_held boolean;
begin
  -- Busca limite da pelada
  select limite_por_ocorrencia into v_limite_por_ocorrencia
  from public.peladas
  where id = p_pelada_id;

  if v_limite_por_ocorrencia is null then
    return jsonb_build_object('error', 'Pelada não encontrada');
  end if;

  -- Busca tipo do jogador na pelada
  select tipo into v_tipo
  from public.pelada_participantes
  where pelada_id = p_pelada_id and user_id = p_user_id;

  if v_tipo is null then
    return jsonb_build_object('error', 'Você não é participante desta pelada');
  end if;

  -- ==========================================
  -- LOCK: Garante consistência em confirmações simultâneas
  -- ==========================================
  v_lock_held := false;

  if p_ocorrencia_id is not null then
    -- Lock na ocorrência específica
    perform 1
    from public.pelada_ocorrencias
    where id = p_ocorrencia_id
    for update;

    if found then
      v_lock_held := true;
    end if;
  end if;

  if not v_lock_held then
    -- Fallback: lock na pelada (para peladas não-recorrentes)
    perform 1
    from public.peladas
    where id = p_pelada_id
    for update;
  end if;

  -- ==========================================
  -- IDEMPOTÊNCIA: já está confirmado? Retorna imediatamente.
  -- Impede que um diarista já confirmado perca a vaga
  -- se clicar em "Confirmar" novamente com a ocorrência lotada.
  -- ==========================================
  if exists(
    select 1 from public.confirmacoes_dia
    where pelada_id = p_pelada_id
      and user_id = p_user_id
      and data_jogo = p_data_jogo
      and status = 'confirmado'
  ) then
    return jsonb_build_object('status', 'confirmado');
  end if;

  -- ==========================================
  -- Conta confirmados atuais para esta data
  -- ==========================================
  select count(*) into v_confirmados_count
  from public.confirmacoes_dia
  where pelada_id = p_pelada_id
    and data_jogo = p_data_jogo
    and status = 'confirmado';

  -- ==========================================
  -- MENSALISTA: sempre confirma (prioridade)
  -- ==========================================
  if v_tipo = 'mensalista' then
    insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
    values (p_pelada_id, p_user_id, p_data_jogo, 'confirmado', p_ocorrencia_id)
    on conflict (pelada_id, user_id, data_jogo)
    do update set
      status = 'confirmado',
      pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

    -- Remove da fila de espera se estiver
    delete from public.lista_espera
    where pelada_id = p_pelada_id and user_id = p_user_id and data_jogo = p_data_jogo;

    -- Reordena fila
    perform public.reeordenar_fila_espera(p_pelada_id, p_data_jogo);

    return jsonb_build_object('status', 'confirmado');
  end if;

  -- ==========================================
  -- DIARISTA: verifica limite
  -- ==========================================
  if v_confirmados_count < v_limite_por_ocorrencia then
    -- Ainda há vagas — confirma
    insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
    values (p_pelada_id, p_user_id, p_data_jogo, 'confirmado', p_ocorrencia_id)
    on conflict (pelada_id, user_id, data_jogo)
    do update set
      status = 'confirmado',
      pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

    return jsonb_build_object('status', 'confirmado');
  end if;

  -- ==========================================
  -- LOTADO: insere na fila de espera
  -- ==========================================
  -- Calcula posição com prioridade: mensalistas sempre na frente
  select
    count(*) filter (where prioridade = 'mensalista'),
    count(*) filter (where prioridade = 'diarista')
  into v_mensalistas_fila, v_diaristas_fila
  from public.lista_espera
  where pelada_id = p_pelada_id and data_jogo = p_data_jogo;

  v_posicao := v_mensalistas_fila + v_diaristas_fila + 1;

  -- Se já estava confirmado (mudando de ideia), primeiro marca como pendente
  insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
  values (p_pelada_id, p_user_id, p_data_jogo, 'pendente', p_ocorrencia_id)
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    status = 'pendente',
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

  -- Insere na fila de espera
  insert into public.lista_espera (pelada_id, user_id, data_jogo, posicao, prioridade, pelada_ocorrencia_id)
  values (p_pelada_id, p_user_id, p_data_jogo, v_posicao, 'diarista', p_ocorrencia_id)
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    posicao = excluded.posicao,
    prioridade = 'diarista',
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, lista_espera.pelada_ocorrencia_id);

  return jsonb_build_object('status', 'fila', 'posicao', v_posicao);
end;
$$;

-- ==========================================
-- 4. RPC: cancelar_presenca_ocorrencia (TRANSACTIONAL)
--    Remove confirmação + promove primeiro da fila automaticamente.
--    Usa lock para garantir consistência.
-- ==========================================
create or replace function public.cancelar_presenca_ocorrencia(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_estava_confirmado boolean;
  v_promovido_id uuid;
  v_nome_promovido text;
  v_lock_held boolean;
begin
  -- ==========================================
  -- LOCK
  -- ==========================================
  v_lock_held := false;

  if p_ocorrencia_id is not null then
    perform 1
    from public.pelada_ocorrencias
    where id = p_ocorrencia_id
    for update;

    if found then
      v_lock_held := true;
    end if;
  end if;

  if not v_lock_held then
    perform 1
    from public.peladas
    where id = p_pelada_id
    for update;
  end if;

  -- ==========================================
  -- Verifica se estava confirmado
  -- ==========================================
  select exists(
    select 1 from public.confirmacoes_dia
    where pelada_id = p_pelada_id
      and user_id = p_user_id
      and data_jogo = p_data_jogo
      and status = 'confirmado'
  ) into v_estava_confirmado;

  -- Remove da fila de espera (se estiver)
  delete from public.lista_espera
  where pelada_id = p_pelada_id and user_id = p_user_id and data_jogo = p_data_jogo;

  -- Atualiza confirmação para recusado
  insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
  values (p_pelada_id, p_user_id, p_data_jogo, 'recusado', p_ocorrencia_id)
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    status = 'recusado',
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

  -- ==========================================
  -- Se estava confirmado, promove primeiro da fila (com prioridade)
  -- ==========================================
  if v_estava_confirmado then
    -- Encontra primeiro da fila (mensalistas primeiro, depois por posição)
    select le.user_id into v_promovido_id
    from public.lista_espera le
    where le.pelada_id = p_pelada_id and le.data_jogo = p_data_jogo
    order by
      case when le.prioridade = 'mensalista' then 0 else 1 end,
      le.posicao asc
    limit 1
    for update;

    if v_promovido_id is not null then
      -- Remove da fila
      delete from public.lista_espera
      where pelada_id = p_pelada_id and data_jogo = p_data_jogo and user_id = v_promovido_id;

      -- Atualiza confirmação para confirmado
      update public.confirmacoes_dia
      set status = 'confirmado'
      where pelada_id = p_pelada_id
        and user_id = v_promovido_id
        and data_jogo = p_data_jogo;

      -- Busca nome para retorno
      select nome into v_nome_promovido
      from public.profiles
      where id = v_promovido_id;

      -- Reordena fila
      perform public.reeordenar_fila_espera(p_pelada_id, p_data_jogo);

      return jsonb_build_object(
        'promovido', true,
        'promovido_id', v_promovido_id,
        'nome_promovido', v_nome_promovido
      );
    end if;
  end if;

  -- Reordena fila
  perform public.reeordenar_fila_espera(p_pelada_id, p_data_jogo);

  return jsonb_build_object('promovido', false);
end;
$$;

-- ==========================================
-- 5. FUNÇÃO AUXILIAR: reordenar_fila_espera
--    Reordena a fila com prioridade: mensalistas primeiro, depois diaristas.
-- ==========================================
create or replace function public.reeordenar_fila_espera(
  p_pelada_id uuid,
  p_data_jogo date
)
returns void
language plpgsql security definer
as $$
begin
  update public.lista_espera le
  set posicao = le2.nova_posicao
  from (
    select
      id,
      row_number() over (
        order by
          case when prioridade = 'mensalista' then 0 else 1 end,
          posicao asc
      ) as nova_posicao
    from public.lista_espera
    where pelada_id = p_pelada_id and data_jogo = p_data_jogo
  ) le2
  where le.id = le2.id;
end;
$$;

-- ==========================================
-- 6. ATUALIZA promover_primeiro_fila — CONSIDERA PRIORIDADE
--    Mensalistas têm prioridade sobre diaristas na promoção.
-- ==========================================
create or replace function public.promover_primeiro_fila(
  p_pelada_id uuid,
  p_data date
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_nome text;
begin
  -- Encontra o primeiro da fila (mensalistas primeiro, depois por posicao)
  select le.user_id into v_user_id
  from public.lista_espera le
  where le.pelada_id = p_pelada_id
    and le.data_jogo = p_data
  order by
    case when le.prioridade = 'mensalista' then 0 else 1 end,
    le.posicao asc
  limit 1;

  if not found then
    return null;
  end if;

  -- Remove da lista de espera
  delete from public.lista_espera
  where pelada_id = p_pelada_id
    and data_jogo = p_data
    and user_id = v_user_id;

  -- Atualiza confirmação para confirmado (se existir)
  update public.confirmacoes_dia
  set status = 'confirmado'
  where pelada_id = p_pelada_id
    and user_id = v_user_id
    and data_jogo = p_data;

  -- Reordena posições da fila (fecha o buraco) com prioridade
  perform public.reeordenar_fila_espera(p_pelada_id, p_data);

  return v_user_id;
end;
$$;

-- ==========================================
-- 7. ATUALIZA proxima_posicao_fila — USA PRIORIDADE
-- ==========================================
create or replace function public.proxima_posicao_fila(
  p_pelada_id uuid,
  p_data date
)
returns integer
language plpgsql
security invoker
stable
as $$
declare
  v_posicao integer;
begin
  select coalesce(max(posicao), 0) + 1 into v_posicao
  from public.lista_espera
  where pelada_id = p_pelada_id
    and data_jogo = p_data;

  return v_posicao;
end;
$$;
