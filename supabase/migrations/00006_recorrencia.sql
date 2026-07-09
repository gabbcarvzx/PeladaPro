-- ==========================================
-- PeladaPro - Recorrência Semanal
-- ==========================================
-- Executar no SQL Editor do Supabase Dashboard.
-- ==========================================

-- 1. ADICIONAR CAMPOS DE RECORRÊNCIA NA TABELA PELADAS
alter table public.peladas
  add column if not exists recorrente boolean not null default false,
  add column if not exists dia_semana integer check (dia_semana between 0 and 6),
  add column if not exists horario time;

-- 2. TABELA PELADA_OCORRENCIAS
create table if not exists public.pelada_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  data date not null,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  created_at timestamptz not null default now(),
  unique(pelada_id, data)
);

-- 3. ÍNDICES
create index if not exists idx_pelada_ocorrencias_pelada_id on public.pelada_ocorrencias(pelada_id);
create index if not exists idx_pelada_ocorrencias_data on public.pelada_ocorrencias(data);
create index if not exists idx_pelada_ocorrencias_status on public.pelada_ocorrencias(status);

-- 4. RLS PELADA_OCORRENCIAS
alter table public.pelada_ocorrencias enable row level security;

create policy "Ocorrências visíveis para autenticados"
  on public.pelada_ocorrencias for select
  to authenticated
  using (true);

create policy "Admin pode criar ocorrências"
  on public.pelada_ocorrencias for insert
  to authenticated
  with check (
    auth.uid() in (
      select admin_id from public.peladas where id = pelada_id
    )
  );

create policy "Admin pode editar ocorrências"
  on public.pelada_ocorrencias for update
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

-- 5. FUNÇÃO: getOrCreateProximaOcorrencia
create or replace function public.get_or_create_proxima_ocorrencia(
  p_pelada_id uuid
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_pelada record;
  v_proxima_data date;
  v_ocorrencia_id uuid;
  v_hoje date;
begin
  -- Busca configuração da pelada
  select * into v_pelada
  from public.peladas
  where id = p_pelada_id;

  if not found then
    return null;
  end if;

  -- Se não for recorrente, retorna null (comportamento normal)
  if not v_pelada.recorrente then
    return null;
  end if;

  v_hoje := current_date;

  -- Calcula a próxima data baseada no dia_semana
  -- Dia da semana atual: 0=domingo, 1=segunda, ..., 6=sábado
  v_proxima_data := v_hoje;
  
  -- Se hoje já passou do dia_semana configurado, vai para a próxima semana
  if extract(dow from v_hoje) > v_pelada.dia_semana then
    v_proxima_data := v_hoje + ((7 - extract(dow from v_hoje) + v_pelada.dia_semana)::integer);
  elsif extract(dow from v_hoje) < v_pelada.dia_semana then
    v_proxima_data := v_hoje + ((v_pelada.dia_semana - extract(dow from v_hoje))::integer);
  end if;
  -- Se é o mesmo dia, usa hoje

  -- Verifica se já existe ocorrência para essa data
  select id into v_ocorrencia_id
  from public.pelada_ocorrencias
  where pelada_id = p_pelada_id
    and data = v_proxima_data;

  -- Se não existir, cria automaticamente
  if not found then
    insert into public.pelada_ocorrencias (pelada_id, data)
    values (p_pelada_id, v_proxima_data)
    returning id into v_ocorrencia_id;
  end if;

  return v_ocorrencia_id;
end;
$$;

-- 6. FUNÇÃO: Criar ocorrência inicial para peladas existentes (migração)
create or replace function public.criar_ocorrencia_inicial(
  p_pelada_id uuid,
  p_data date
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_ocorrencia_id uuid;
begin
  insert into public.pelada_ocorrencias (pelada_id, data)
  values (p_pelada_id, p_data)
  on conflict (pelada_id, data) do nothing
  returning id into v_ocorrencia_id;

  return v_ocorrencia_id;
end;
$$;
