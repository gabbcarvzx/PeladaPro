-- ==========================================
-- PeladaPro - RPCs Transactionais para Confrontos
-- ==========================================
-- Migration 00020 — Hardening do sistema de confrontos
--
-- RPCs:
--   1. finalizar_confronto:
--      Recebe os dados do próximo confronto já calculados pelo backend,
--      adquire FOR UPDATE lock, finaliza o atual e insere o próximo
--      atomicamente.
--   2. limpar_estado_confrontos:
--      Remove confrontos e eventos de uma pelada antes de refazer sorteio.
--
-- Idempotente: CREATE OR REPLACE = pode executar múltiplas vezes.
-- ==========================================

-- ==========================================
-- 1. RPC: finalizar_confronto
--
-- Fluxo transactional:
--   1. FOR UPDATE lock no confronto (bloqueia concorrência)
--   2. Valida status e permissão
--   3. Finaliza confronto atual (status='finalizado', resultado)
--   4. Se houver próximo confronto → insere
--   5. Tudo na mesma transação
--
-- Parâmetros:
--   p_confronto_id     : UUID do confronto a finalizar
--   p_resultado        : 'time_a' | 'time_b' | 'empate'
--   p_proximo_jsonb    : jsonb com dados do próximo confronto (ou null se encerrar)
--
--   p_proximo_jsonb estrutura:
--     {
--       "time_a_nome": string,
--       "time_b_nome": string,
--       "time_a_jogadores": array,
--       "time_b_jogadores": array,
--       "fila_restante": array | null,
--       "ordem": number
--     }
-- ==========================================
create or replace function public.finalizar_confronto(
  p_confronto_id uuid,
  p_resultado text,
  p_proximo_jsonb jsonb default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_confronto record;
  v_proximo_id uuid;
  v_time_a_nome text;
  v_time_b_nome text;
  v_ordem integer;
  v_fila_restante jsonb;
begin
  -- ==========================================
  -- Valida resultado
  -- ==========================================
  if p_resultado not in ('time_a', 'time_b', 'empate') then
    return jsonb_build_object('error', 'Resultado inválido');
  end if;

  -- ==========================================
  -- Verifica se o caller é admin da pelada (defense-in-depth)
  -- ==========================================
  if not exists(
    select 1 from public.peladas p
    inner join public.confrontos c on c.pelada_id = p.id
    where c.id = p_confronto_id and p.admin_id = auth.uid()
  ) then
    return jsonb_build_object('error', 'Apenas o admin pode finalizar confrontos');
  end if;

  -- ==========================================
  -- FOR UPDATE lock no confronto
  -- ==========================================
  select * into v_confronto
  from public.confrontos
  where id = p_confronto_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Confronto não encontrado');
  end if;

  if v_confronto.status != 'em_andamento' then
    return jsonb_build_object('error', 'Confronto já finalizado');
  end if;

  -- ==========================================
  -- Finaliza confronto atual
  -- ==========================================
  update public.confrontos
  set
    status = 'finalizado',
    resultado = p_resultado,
    cronometro_status = 'parado'
  where id = p_confronto_id;

  -- ==========================================
  -- Cria próximo confronto (se houver dados)
  -- ==========================================
  if p_proximo_jsonb is not null then
    v_time_a_nome := p_proximo_jsonb ->> 'time_a_nome';
    v_time_b_nome := p_proximo_jsonb ->> 'time_b_nome';
    v_ordem := (p_proximo_jsonb ->> 'ordem')::integer;
    v_fila_restante := p_proximo_jsonb -> 'fila_restante';

    -- Se fila_restante for array vazio, guarda como null
    if v_fila_restante is not null and jsonb_typeof(v_fila_restante) = 'array' and jsonb_array_length(v_fila_restante) = 0 then
      v_fila_restante := null;
    end if;

    insert into public.confrontos (
      pelada_id,
      sorteio_id,
      pelada_ocorrencia_id,
      time_a_nome,
      time_b_nome,
      time_a_jogadores,
      time_b_jogadores,
      fila_restante,
      tempo_limite,
      ordem
    ) values (
      v_confronto.pelada_id,
      v_confronto.sorteio_id,
      v_confronto.pelada_ocorrencia_id,
      v_time_a_nome,
      v_time_b_nome,
      p_proximo_jsonb -> 'time_a_jogadores',
      p_proximo_jsonb -> 'time_b_jogadores',
      v_fila_restante,
      v_confronto.tempo_limite,
      v_ordem
    )
    returning id into v_proximo_id;
  end if;

  return jsonb_build_object(
    'finalizado_id', p_confronto_id,
    'proximo_id', v_proximo_id
  );
end;
$$;

-- ==========================================
-- 2. RPC: limpar_estado_confrontos
--
-- Remove todos os confrontos e eventos de uma pelada,
-- garantindo estado limpo antes de refazer sorteio.
-- ==========================================
create or replace function public.limpar_estado_confrontos(
  p_pelada_id uuid,
  p_ocorrencia_id uuid default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_confronto_ids uuid[];
  v_count_eventos integer;
  v_count_confrontos integer;
begin
  -- ==========================================
  -- Verifica se o caller é admin da pelada
  -- ==========================================
  if not exists(
    select 1 from public.peladas
    where id = p_pelada_id and admin_id = auth.uid()
  ) then
    return jsonb_build_object('error', 'Apenas o admin pode limpar estado de confrontos');
  end if;

  -- ==========================================
  -- Busca IDs dos confrontos a remover
  -- ==========================================
  if p_ocorrencia_id is not null then
    select array_agg(id) into v_confronto_ids
    from public.confrontos
    where pelada_id = p_pelada_id
      and pelada_ocorrencia_id = p_ocorrencia_id;
  else
    select array_agg(id) into v_confronto_ids
    from public.confrontos
    where pelada_id = p_pelada_id;
  end if;

  if v_confronto_ids is null then
    return jsonb_build_object(
      'removido_eventos', 0,
      'removido_confrontos', 0
    );
  end if;

  -- ==========================================
  -- Remove eventos vinculados (CASCADE não é suficiente
  -- porque eventos têm FK para confrontos)
  -- ==========================================
  delete from public.eventos_confronto
  where confronto_id = any(v_confronto_ids);

  get diagnostics v_count_eventos = row_count;

  -- ==========================================
  -- Remove confrontos
  -- ==========================================
  delete from public.confrontos
  where id = any(v_confronto_ids);

  get diagnostics v_count_confrontos = row_count;

  return jsonb_build_object(
    'removido_eventos', v_count_eventos,
    'removido_confrontos', v_count_confrontos
  );
end;
$$;
