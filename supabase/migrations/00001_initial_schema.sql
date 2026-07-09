-- ==========================================
-- PeladaPro - Migração Inicial do Banco
-- ==========================================
-- Este arquivo contém toda a modelagem do banco de dados.
-- Execute no SQL Editor do Supabase Dashboard.
-- ==========================================

-- 1. EXTENSÕES
create extension if not exists "pgcrypto";

-- 2. FUNÇÃO PARA ATUALIZAR UPDATED_AT
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security invoker;

-- 3. TABELA PROFILES (estende auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  avatar_url text,
  numero_favorito integer check (numero_favorito >= 0 AND numero_favorito <= 99),
  tipo text not null default 'diarista' check (tipo in ('mensalista', 'diarista')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: criar profile automaticamente ao criar usuário
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: updated_at
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- 4. TABELA PELADAS
create table public.peladas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  link_convite text not null unique,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  limite_jogadores integer not null default 20,
  numero_times integer not null default 2,
  jogadores_por_time integer not null default 5,
  local text,
  data timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_peladas_updated_at
  before update on public.peladas
  for each row execute function public.handle_updated_at();

-- 5. TABELA PELADA_PARTICIPANTES
create table public.pelada_participantes (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null default 'diarista' check (tipo in ('mensalista', 'diarista')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pelada_id, user_id)
);

create trigger handle_pelada_participantes_updated_at
  before update on public.pelada_participantes
  for each row execute function public.handle_updated_at();

-- 6. TABELA CONFIRMACOES_DIA
create table public.confirmacoes_dia (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data_jogo date not null,
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'recusado')),
  ordem_chegada integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pelada_id, user_id, data_jogo)
);

create trigger handle_confirmacoes_dia_updated_at
  before update on public.confirmacoes_dia
  for each row execute function public.handle_updated_at();

-- 7. TABELA HISTORICO_SORTEIOS
create table public.historico_sorteios (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  data_sorteio timestamptz not null default now(),
  modo text not null check (modo in ('aleatorio', 'ordem_chegada', 'priorizar_mensalistas', 'equilibrado')),
  times jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 8. ÍNDICES PARA PERFORMANCE
create index idx_profiles_email on public.profiles(email);
create index idx_peladas_admin_id on public.peladas(admin_id);
create index idx_peladas_link_convite on public.peladas(link_convite);
create index idx_pelada_participantes_pelada_id on public.pelada_participantes(pelada_id);
create index idx_pelada_participantes_user_id on public.pelada_participantes(user_id);
create index idx_confirmacoes_dia_pelada_id on public.confirmacoes_dia(pelada_id);
create index idx_confirmacoes_dia_data_jogo on public.confirmacoes_dia(data_jogo);
create index idx_confirmacoes_dia_status on public.confirmacoes_dia(status);
create index idx_historico_sorteios_pelada_id on public.historico_sorteios(pelada_id);

-- ==========================================
-- RLS - ROW LEVEL SECURITY
-- ==========================================

-- Habilitar RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.peladas enable row level security;
alter table public.pelada_participantes enable row level security;
alter table public.confirmacoes_dia enable row level security;
alter table public.historico_sorteios enable row level security;

-- PROFILES
-- Qualquer um pode ver perfis (para listar jogadores)
create policy "Perfis são visíveis para todos autenticados"
  on public.profiles for select
  to authenticated
  using (true);

-- Usuário pode editar seu próprio perfil
create policy "Usuário pode editar seu próprio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- PELADAS
-- Qualquer autenticado pode ver peladas
create policy "Peladas visíveis para participantes e admin"
  on public.peladas for select
  to authenticated
  using (
    auth.uid() = admin_id
    or auth.uid() in (
      select user_id from public.pelada_participantes where pelada_id = id
    )
  );

-- Admin pode criar/editar/deletar suas peladas
create policy "Admin pode criar peladas"
  on public.peladas for insert
  to authenticated
  with check (auth.uid() = admin_id);

create policy "Admin pode editar sua pelada"
  on public.peladas for update
  to authenticated
  using (auth.uid() = admin_id)
  with check (auth.uid() = admin_id);

create policy "Admin pode deletar sua pelada"
  on public.peladas for delete
  to authenticated
  using (auth.uid() = admin_id);

-- PELADA_PARTICIPANTES
-- Participantes podem ver participantes da pelada
create policy "Participantes visíveis para autenticados"
  on public.pelada_participantes for select
  to authenticated
  using (true);

-- Admin pode adicionar/remover participantes
create policy "Admin pode adicionar participantes"
  on public.pelada_participantes for insert
  to authenticated
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
    or auth.uid() = user_id -- jogador pode se auto-adicionar via link
  );

create policy "Admin pode remover participantes"
  on public.pelada_participantes for delete
  to authenticated
  using (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

create policy "Participante pode sair da pelada"
  on public.pelada_participantes for delete
  to authenticated
  using (auth.uid() = user_id);

-- CONFIRMACOES_DIA
-- Participantes podem ver confirmações da pelada
create policy "Confirmações visíveis para autenticados"
  on public.confirmacoes_dia for select
  to authenticated
  using (true);

-- Jogador pode confirmar/recusar presença
create policy "Jogador pode gerenciar sua confirmação"
  on public.confirmacoes_dia for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Jogador pode editar sua confirmação"
  on public.confirmacoes_dia for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin pode confirmar chegada e alterar status
create policy "Admin pode gerenciar confirmações"
  on public.confirmacoes_dia for update
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

-- HISTORICO_SORTEIOS
-- Participantes podem ver sorteios
create policy "Sorteios visíveis para autenticados"
  on public.historico_sorteios for select
  to authenticated
  using (true);

-- Apenas admin pode criar sorteios
create policy "Admin pode criar sorteios"
  on public.historico_sorteios for insert
  to authenticated
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

-- ==========================================
-- FUNÇÕES AUXILIARES
-- ==========================================

-- Função para gerar link único de convite
create or replace function public.gerar_link_convite()
returns text as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql security invoker;

-- Função para contar confirmados em uma pelada em determinada data
create or replace function public.contar_confirmados(p_pelada_id uuid, p_data date)
returns integer as $$
  select count(*)::integer
  from public.confirmacoes_dia
  where pelada_id = p_pelada_id
    and data_jogo = p_data
    and status = 'confirmado';
$$ language sql security invoker stable;
