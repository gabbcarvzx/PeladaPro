-- ==========================================
-- PeladaPro - Novo Modelo: Controle Total pelo Admin
-- ==========================================
-- Remove:
--   - Sistema de convite (link_convite, invite_code, is_public)
--   - Prioridade mensalista/diarista em fila e sorteio
--   - Auto-participação (jogador se adicionar sozinho)
--   - Múltiplos modos de sorteio
--
-- Adiciona:
--   - hora_chegada timestamptz (prioridade real = chegada física)
--   - RPCs transactionais: confirmar_intencao, confirmar_chegada, recusar_presenca
--   - Segurança: apenas admin insere participantes
-- ==========================================

-- ==========================================
-- 1. REMOVER CAMPOS OBSOLETOS DA TABELA PELADAS
-- ==========================================
alter table public.peladas
  drop column if exists link_convite;

alter table public.peladas
  drop column if exists invite_code;

alter table public.peladas
  drop column if exists is_public;

alter table public.peladas
  drop column if exists limite_jogadores;

-- Remove índices obsoletos
drop index if exists idx_peladas_link_convite;
drop index if exists idx_peladas_invite_code;

-- ==========================================
-- 2. ADICIONAR hora_chegada NA CONFIRMACOES_DIA
-- ==========================================
alter table public.confirmacoes_dia
  add column if not exists hora_chegada timestamptz;

-- ==========================================
-- 3. REMOVER prioridade DA LISTA_ESPERA
-- ==========================================
alter table public.lista_espera
  drop column if exists prioridade;

-- ==========================================
-- 4. ATUALIZAR CHECK CONSTRAINTS
-- ==========================================

-- Pelada participantes: tipo é apenas informativo, remove check
alter table public.pelada_participantes
  drop constraint if exists pelada_participantes_tipo_check;

-- Profiles: tipo é apenas informativo
alter table public.profiles
  drop constraint if exists profiles_tipo_check;

-- Historico sorteios: apenas modo ordem_chegada
alter table public.historico_sorteios
  drop constraint if exists historico_sorteios_modo_check;

alter table public.historico_sorteios
  add constraint historico_sorteios_modo_check
  check (modo in ('ordem_chegada'));

-- ==========================================
-- 5. ATUALIZAR RLS — PELADA_PARTICIPANTES
-- ==========================================
-- Remove policy antiga que permitia auto-inserção
drop policy if exists "Admin pode adicionar participantes" on public.pelada_participantes;
drop policy if exists "Participante pode sair da pelada" on public.pelada_participantes;

-- Apenas admin pode adicionar participantes
create policy "Admin pode adicionar participantes"
  on public.pelada_participantes for insert
  to authenticated
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- Apenas admin pode remover participantes
drop policy if exists "Admin pode remover participantes" on public.pelada_participantes;
create policy "Admin pode remover participantes"
  on public.pelada_participantes for delete
  to authenticated
  using (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- ==========================================
-- 6. ATUALIZAR RLS — CONFIRMACOES_DIA
-- ==========================================
drop policy if exists "Jogador pode gerenciar sua confirmação" on public.confirmacoes_dia;
drop policy if exists "Jogador pode editar sua confirmação" on public.confirmacoes_dia;

-- Jogador pode inserir confirmação apenas como pendente (intenção)
create policy "Jogador pode inserir intenção"
  on public.confirmacoes_dia for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pendente'
  );

-- Jogador pode editar própria confirmação apenas se for pendente
create policy "Jogador pode editar intenção"
  on public.confirmacoes_dia for update
  to authenticated
  using (
    auth.uid() = user_id
    and status = 'pendente'
  )
  with check (
    auth.uid() = user_id
    and status in ('pendente', 'recusado')
  );

-- ==========================================
-- 7. ATUALIZAR RLS — LISTA_ESPERA
-- ==========================================
drop policy if exists "Jogador ou admin pode inserir na fila" on public.lista_espera;
drop policy if exists "Jogador ou admin pode remover da fila" on public.lista_espera;

-- Apenas admin pode remover da fila
create policy "Admin pode remover da fila"
  on public.lista_espera for delete
  to authenticated
  using (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- ==========================================
-- 8. NOVA RPC: confirmar_intencao
--    Jogador (ou admin) marca intenção de ir.
--    Apenas status = 'pendente'.
--    Sem prioridade, sem efeito em limite.
-- ==========================================
create or replace function public.confirmar_intencao(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
)
returns jsonb
language plpgsql security definer
as $$
begin
  -- Verifica se o caller é o próprio jogador ou admin da pelada
  if auth.uid() != p_user_id then
    if not exists(
      select 1 from public.peladas
      where id = p_pelada_id and admin_id = auth.uid()
    ) then
      return jsonb_build_object('error', 'Apenas o jogador ou o admin podem marcar intenção');
    end if;
  end if;

  -- Verifica se é participante da pelada
  if not exists(
    select 1 from public.pelada_participantes
    where pelada_id = p_pelada_id and user_id = p_user_id
  ) then
    return jsonb_build_object('error', 'Você não é participante desta pelada');
  end if;

  -- Upsert: cria ou mantém como pendente
  insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
  values (p_pelada_id, p_user_id, p_data_jogo, 'pendente', p_ocorrencia_id)
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    status = case
      when confirmacoes_dia.status = 'recusado' then 'pendente'
      else confirmacoes_dia.status
    end,
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

  return jsonb_build_object('status', 'pendente');
end;
$$;

-- ==========================================
-- 9. NOVA RPC: confirmar_chegada (TRANSACTIONAL)
--    Apenas admin pode chamar.
--    Fluxo:
--      1. Lock na ocorrência
--      2. Verifica se já está confirmado com hora_chegada
--      3. Conta confirmados com hora_chegada NOT NULL
--      4. Se < limite: marca confirmado + hora_chegada + ordem_chegada
--      5. Se >= limite: insere na lista_espera
-- ==========================================
create or replace function public.confirmar_chegada(
  p_pelada_id uuid,
  p_user_id uuid,
  p_data_jogo date,
  p_ocorrencia_id uuid default null
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_limite integer;
  v_confirmados_count integer;
  v_proxima_ordem integer;
  v_lock_held boolean;
begin
  -- ==========================================
  -- Verifica se é admin da pelada
  -- ==========================================
  if not exists(
    select 1 from public.peladas
    where id = p_pelada_id and admin_id = auth.uid()
  ) then
    return jsonb_build_object('error', 'Apenas o admin pode confirmar chegada');
  end if;

  -- ==========================================
  -- Busca limite da pelada
  -- ==========================================
  select coalesce(limite_por_ocorrencia, 25) into v_limite
  from public.peladas
  where id = p_pelada_id;

  if v_limite is null then
    return jsonb_build_object('error', 'Pelada não encontrada');
  end if;

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
  -- Verifica se jogador já está confirmado com chegada
  -- ==========================================
  if exists(
    select 1 from public.confirmacoes_dia
    where pelada_id = p_pelada_id
      and user_id = p_user_id
      and data_jogo = p_data_jogo
      and status = 'confirmado'
      and hora_chegada is not null
  ) then
    return jsonb_build_object('error', 'Jogador já teve a chegada confirmada');
  end if;

  -- ==========================================
  -- Conta confirmados com chegada para esta data
  -- ==========================================
  select count(*) into v_confirmados_count
  from public.confirmacoes_dia
  where pelada_id = p_pelada_id
    and data_jogo = p_data_jogo
    and status = 'confirmado'
    and hora_chegada is not null;

  -- ==========================================
  -- Calcula próxima ordem de chegada
  -- ==========================================
  select coalesce(max(ordem_chegada), 0) + 1 into v_proxima_ordem
  from public.confirmacoes_dia
  where pelada_id = p_pelada_id
    and data_jogo = p_data_jogo;

  -- ==========================================
  -- Se há vaga: confirma com hora_chegada
  -- ==========================================
  if v_confirmados_count < v_limite then
    insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, ordem_chegada, hora_chegada, pelada_ocorrencia_id)
    values (p_pelada_id, p_user_id, p_data_jogo, 'confirmado', v_proxima_ordem, now(), p_ocorrencia_id)
    on conflict (pelada_id, user_id, data_jogo)
    do update set
      status = 'confirmado',
      ordem_chegada = v_proxima_ordem,
      hora_chegada = now(),
      pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

    -- Remove da fila de espera se estiver
    delete from public.lista_espera
    where pelada_id = p_pelada_id and user_id = p_user_id and data_jogo = p_data_jogo;

    return jsonb_build_object(
      'status', 'confirmado',
      'ordem_chegada', v_proxima_ordem,
      'confirmados', v_confirmados_count + 1,
      'limite', v_limite
    );
  end if;

  -- ==========================================
  -- LOTADO: insere na fila de espera (sem prioridade)
  -- ==========================================
  -- Marca como pendente se não existir
  insert into public.confirmacoes_dia (pelada_id, user_id, data_jogo, status, pelada_ocorrencia_id)
  values (p_pelada_id, p_user_id, p_data_jogo, 'pendente', p_ocorrencia_id)
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    status = case
      when confirmacoes_dia.status = 'confirmado' then confirmacoes_dia.status
      else 'pendente'
    end,
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, confirmacoes_dia.pelada_ocorrencia_id);

  -- Insere na fila de espera (posição = max + 1)
  insert into public.lista_espera (pelada_id, user_id, data_jogo, posicao, pelada_ocorrencia_id)
  select
    p_pelada_id,
    p_user_id,
    p_data_jogo,
    coalesce(max(posicao), 0) + 1,
    p_ocorrencia_id
  from public.lista_espera
  where pelada_id = p_pelada_id and data_jogo = p_data_jogo
  on conflict (pelada_id, user_id, data_jogo)
  do update set
    posicao = (select coalesce(max(posicao), 0) + 1 from public.lista_espera where pelada_id = p_pelada_id and data_jogo = p_data_jogo),
    pelada_ocorrencia_id = coalesce(p_ocorrencia_id, lista_espera.pelada_ocorrencia_id);

  return jsonb_build_object(
    'status', 'fila',
    'posicao', (select posicao from public.lista_espera where pelada_id = p_pelada_id and user_id = p_user_id and data_jogo = p_data_jogo),
    'confirmados', v_confirmados_count,
    'limite', v_limite
  );
end;
$$;

-- ==========================================
-- 10. NOVA RPC: recusar_presenca (TRANSACTIONAL)
--     Marca como recusado e promove primeiro da fila
--     se o jogador estava confirmado com chegada.
-- ==========================================
create or replace function public.recusar_presenca(
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
  -- Verifica se o caller é admin ou o próprio jogador
  -- ==========================================
  if auth.uid() != p_user_id then
    if not exists(
      select 1 from public.peladas
      where id = p_pelada_id and admin_id = auth.uid()
    ) then
      return jsonb_build_object('error', 'Apenas o admin ou o próprio jogador pode recusar presença');
    end if;
  end if;

  -- ==========================================
  -- Verifica se estava confirmado com chegada
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

  -- Atualiza confirmação para recusado (limpa hora_chegada e ordem_chegada)
  update public.confirmacoes_dia
  set status = 'recusado',
      hora_chegada = null,
      ordem_chegada = null
  where pelada_id = p_pelada_id
    and user_id = p_user_id
    and data_jogo = p_data_jogo;

  -- ==========================================
  -- Se estava confirmado, promove primeiro da fila
  -- ==========================================
  if v_estava_confirmado then
    -- Encontra primeiro da fila (ordem por posicao ASC)
    select le.user_id into v_promovido_id
    from public.lista_espera le
    where le.pelada_id = p_pelada_id and le.data_jogo = p_data_jogo
    order by le.posicao asc
    limit 1
    for update;

    if v_promovido_id is not null then
      -- Remove da fila
      delete from public.lista_espera
      where pelada_id = p_pelada_id and data_jogo = p_data_jogo and user_id = v_promovido_id;

      -- Calcula próxima ordem
      update public.confirmacoes_dia
      set status = 'confirmado',
          hora_chegada = now(),
          ordem_chegada = (
            select coalesce(max(ordem_chegada), 0) + 1
            from public.confirmacoes_dia
            where pelada_id = p_pelada_id and data_jogo = p_data_jogo
          )
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

  -- Reordena fila se não houve promoção
  perform public.reeordenar_fila_espera(p_pelada_id, p_data_jogo);

  return jsonb_build_object('promovido', false);
end;
$$;

-- ==========================================
-- 11. ATUALIZAR promover_primeiro_fila — SEM PRIORIDADE
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
begin
  -- Encontra o primeiro da fila (menor posicao)
  select le.user_id into v_user_id
  from public.lista_espera le
  where le.pelada_id = p_pelada_id
    and le.data_jogo = p_data
  order by le.posicao asc
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
  set status = 'confirmado',
      hora_chegada = now(),
      ordem_chegada = (
        select coalesce(max(ordem_chegada), 0) + 1
        from public.confirmacoes_dia
        where pelada_id = p_pelada_id and data_jogo = p_data
      )
  where pelada_id = p_pelada_id
    and user_id = v_user_id
    and data_jogo = p_data;

  -- Reordena posições da fila (fecha o buraco)
  perform public.reeordenar_fila_espera(p_pelada_id, p_data);

  return v_user_id;
end;
$$;

-- ==========================================
-- 12. ATUALIZAR reordenar_fila_espera — SEM PRIORIDADE
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
        order by posicao asc
      ) as nova_posicao
    from public.lista_espera
    where pelada_id = p_pelada_id and data_jogo = p_data_jogo
  ) le2
  where le.id = le2.id;
end;
$$;

-- ==========================================
-- 13. ATUALIZAR adicionar_participante — SÓ ADMIN
--     Remove verificação de limite (participantes ilimitados)
--     Idempotente
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
  -- Verifica se o caller é admin da pelada
  if not exists(
    select 1 from public.peladas
    where id = p_pelada_id and admin_id = auth.uid()
  ) then
    return false;
  end if;

  -- Idempotência: já é participante?
  select exists(
    select 1 from public.pelada_participantes
    where pelada_id = p_pelada_id and user_id = p_user_id
  ) into v_exists;

  if v_exists then
    return true;
  end if;

  -- Insere sem verificar limite
  insert into public.pelada_participantes (pelada_id, user_id)
  values (p_pelada_id, p_user_id);

  return true;
end;
$$;

-- ==========================================
-- 14. REMOVER FUNÇÕES OBSOLETAS
-- ==========================================
drop function if exists public.adicionar_membro_sem_limite(uuid, uuid);
drop function if exists public.buscar_por_invite_code(text);
drop function if exists public.buscar_por_link_convite(text);
drop function if exists public.gerar_link_convite();
