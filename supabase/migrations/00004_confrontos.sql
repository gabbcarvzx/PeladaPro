-- ==========================================
-- PeladaPro - Sistema de Confrontos ao Vivo
-- ==========================================
-- Executar no SQL Editor do Supabase Dashboard.
-- ==========================================

-- 1. TABELA CONFRONTOS
create table public.confrontos (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  sorteio_id uuid references public.historico_sorteios(id) on delete set null,
  time_a_nome text not null,
  time_b_nome text not null,
  time_a_jogadores jsonb not null default '[]'::jsonb,
  time_b_jogadores jsonb not null default '[]'::jsonb,
  placar_a integer not null default 0,
  placar_b integer not null default 0,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'finalizado')),
  resultado text check (resultado in ('time_a', 'time_b', 'empate')),
  fila_restante jsonb,
  ordem integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: updated_at
create trigger handle_confrontos_updated_at
  before update on public.confrontos
  for each row execute function public.handle_updated_at();

-- 2. ÍNDICES CONFRONTOS
create index idx_confrontos_pelada_id on public.confrontos(pelada_id);
create index idx_confrontos_status on public.confrontos(status);
create index idx_confrontos_ordem on public.confrontos(pelada_id, ordem);

-- 3. TABELA EVENTOS_CONFRONTO
create table public.eventos_confronto (
  id uuid primary key default gen_random_uuid(),
  confronto_id uuid not null references public.confrontos(id) on delete cascade,
  jogador_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('gol', 'assistencia')),
  time_id text not null check (time_id in ('a', 'b')),
  created_at timestamptz not null default now()
);

-- 4. ÍNDICES EVENTOS
create index idx_eventos_confronto_confronto_id on public.eventos_confronto(confronto_id);
create index idx_eventos_confronto_jogador_id on public.eventos_confronto(jogador_id);

-- 5. RLS CONFRONTOS
alter table public.confrontos enable row level security;

-- Qualquer autenticado pode ver confrontos
create policy "Confrontos visíveis para autenticados"
  on public.confrontos for select
  to authenticated
  using (true);

-- Apenas admin pode criar confrontos
create policy "Admin pode criar confrontos"
  on public.confrontos for insert
  to authenticated
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- Apenas admin pode editar confrontos (placar, status)
create policy "Admin pode editar confrontos"
  on public.confrontos for update
  to authenticated
  using (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  )
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- 6. RLS EVENTOS_CONFRONTO
alter table public.eventos_confronto enable row level security;

-- Qualquer autenticado pode ver eventos
create policy "Eventos visíveis para autenticados"
  on public.eventos_confronto for select
  to authenticated
  using (true);

-- Apenas admin pode registrar eventos (gol/assistencia)
create policy "Admin pode registrar eventos"
  on public.eventos_confronto for insert
  to authenticated
  with check (
    auth.uid() in (
      select peladas.admin_id from public.peladas
      inner join public.confrontos on confrontos.pelada_id = peladas.id
      where confrontos.id = confronto_id
    )
  );

-- 7. FUNÇÃO PARA INCREMENTAR PLACAR
create or replace function public.incrementar_placar(
  p_confronto_id uuid,
  p_time text
)
returns void
language plpgsql
security invoker
as $$
begin
  if p_time = 'a' then
    update public.confrontos
    set placar_a = placar_a + 1
    where id = p_confronto_id;
  elsif p_time = 'b' then
    update public.confrontos
    set placar_b = placar_b + 1
    where id = p_confronto_id;
  end if;
end;
$$;
