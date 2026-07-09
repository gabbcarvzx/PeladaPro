-- ==========================================
-- PeladaPro - Ocorrência nas Tabelas Operacionais
-- ==========================================
-- Executar no SQL Editor do Supabase Dashboard APÓS 00006_recorrencia.sql.
-- ==========================================

-- 1. ADICIONAR OCORRENCIA_ID NAS TABELAS OPERACIONAIS
alter table public.confirmacoes_dia
  add column if not exists pelada_ocorrencia_id uuid references public.pelada_ocorrencias(id) on delete set null;

alter table public.lista_espera
  add column if not exists pelada_ocorrencia_id uuid references public.pelada_ocorrencias(id) on delete set null;

alter table public.historico_sorteios
  add column if not exists pelada_ocorrencia_id uuid references public.pelada_ocorrencias(id) on delete set null;

alter table public.confrontos
  add column if not exists pelada_ocorrencia_id uuid references public.pelada_ocorrencias(id) on delete set null;

-- 2. ÍNDICES
create index if not exists idx_confirmacoes_dia_ocorrencia on public.confirmacoes_dia(pelada_ocorrencia_id);
create index if not exists idx_lista_espera_ocorrencia on public.lista_espera(pelada_ocorrencia_id);
create index if not exists idx_historico_sorteios_ocorrencia on public.historico_sorteios(pelada_ocorrencia_id);
create index if not exists idx_confrontos_ocorrencia on public.confrontos(pelada_ocorrencia_id);

-- 3. FUNÇÃO: getOrCreateProximaOcorrencia v2 (com retorno completo)
-- Drop necessário porque o RETURN type mudou (UUID → OUT params)
drop function if exists public.get_or_create_proxima_ocorrencia(uuid);

create or replace function public.get_or_create_proxima_ocorrencia(
  p_pelada_id uuid,
  out ocorrencia_id uuid,
  out ocorrencia_data date
)
language plpgsql
security invoker
as $$
declare
  v_pelada record;
  v_proxima_data date;
  v_hoje date;
begin
  ocorrencia_id := null;
  ocorrencia_data := null;

  -- Busca configuração da pelada
  select * into v_pelada
  from public.peladas
  where id = p_pelada_id;

  if not found then
    return;
  end if;

  -- Se não for recorrente, retorna null (comportamento normal)
  if not v_pelada.recorrente then
    return;
  end if;

  v_hoje := current_date;

  -- Calcula a próxima data baseada no dia_semana
  v_proxima_data := v_hoje;

  if extract(dow from v_hoje) > v_pelada.dia_semana then
    v_proxima_data := v_hoje + ((7 - extract(dow from v_hoje) + v_pelada.dia_semana)::integer);
  elsif extract(dow from v_hoje) < v_pelada.dia_semana then
    v_proxima_data := v_hoje + ((v_pelada.dia_semana - extract(dow from v_hoje))::integer);
  end if;

  -- Verifica se já existe ocorrência para essa data
  select id into ocorrencia_id
  from public.pelada_ocorrencias
  where pelada_id = p_pelada_id
    and data = v_proxima_data;

  -- Se não existir, cria automaticamente
  if not found then
    insert into public.pelada_ocorrencias (pelada_id, data)
    values (p_pelada_id, v_proxima_data)
    returning id into ocorrencia_id;
  end if;

  ocorrencia_data := v_proxima_data;
end;
$$;
