-- ==========================================
-- PeladaPro - Cronômetro ao Vivo para Confrontos
-- ==========================================
-- Implementa cronômetro com contagem PROGRESSIVA (elapsed time)
-- usando o banco como fonte da verdade.
-- Idempotente: pode executar múltiplas vezes.
-- ==========================================

-- 1. ADICIONA CAMPOS DO CRONÔMETRO (se não existirem)
alter table public.confrontos
  add column if not exists tempo_inicio timestamptz,
  add column if not exists tempo_pausado_em timestamptz,
  add column if not exists tempo_acumulado integer not null default 0;

-- 2. ADICIONA COLUNA DE STATUS DO CRONÔMETRO
alter table public.confrontos
  add column if not exists cronometro_status text not null default 'parado'
  check (cronometro_status in ('parado', 'rodando', 'pausado'));

-- ==========================================
-- Instruções pós-execução:
-- Após executar no SQL Editor do Supabase Dashboard,
-- execute também: NOTIFY pgrst, 'reload schema';
-- para forçar o recarregamento do schema cache.
-- ==========================================
