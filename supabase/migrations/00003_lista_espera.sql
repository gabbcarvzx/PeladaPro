-- ==========================================
-- PeladaPro - Lista de Espera com Prioridade
-- ==========================================
-- Executar no SQL Editor do Supabase Dashboard.
-- ==========================================

-- 1. TABELA LISTA_ESPERA
create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data_jogo date not null,
  posicao integer not null,
  prioridade text not null default 'diarista' check (prioridade in ('mensalista', 'diarista')),
  created_at timestamptz not null default now(),
  unique(pelada_id, user_id, data_jogo)
);

-- 2. ÍNDICES
create index idx_lista_espera_pelada_data on public.lista_espera(pelada_id, data_jogo);
create index idx_lista_espera_posicao on public.lista_espera(pelada_id, data_jogo, posicao);

-- 3. RLS
alter table public.lista_espera enable row level security;

-- Qualquer autenticado pode ver a lista de espera
create policy "Lista de espera visível para autenticados"
  on public.lista_espera for select
  to authenticated
  using (true);

-- Jogador pode entrar na fila; admin pode gerenciar
create policy "Jogador ou admin pode inserir na fila"
  on public.lista_espera for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- Admin pode remover da fila; jogador pode sair da fila
create policy "Jogador ou admin pode remover da fila"
  on public.lista_espera for delete
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- 4. FUNÇÃO DE PROMOÇÃO AUTOMÁTICA
-- Remove o primeiro da fila, atualiza confirmação para confirmado,
-- e retorna o user_id promovido (ou null se fila vazia)
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
  set status = 'confirmado'
  where pelada_id = p_pelada_id
    and user_id = v_user_id
    and data_jogo = p_data;

  -- Reordena posições da fila (fecha o buraco)
  update public.lista_espera
  set posicao = posicao - 1
  where pelada_id = p_pelada_id
    and data_jogo = p_data
    and posicao > 0;

  return v_user_id;
end;
$$;

-- 5. FUNÇÃO PARA OBTER PRÓXIMA POSIÇÃO NA FILA
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
