-- ==========================================
-- PeladaPro - Adiciona tempo_limite na tabela confrontos
-- ==========================================
-- A migration 00004_confrontos.sql definiu a coluna tempo_limite
-- na criação da tabela, mas pode não ter sido aplicada no banco.
-- Esta migration é IDEMPOTENTE: pode ser executada múltiplas vezes.
-- ==========================================

-- 1. ADICIONA COLUNA tempo_limite SE NÃO EXISTIR
alter table public.confrontos
  add column if not exists tempo_limite integer not null default 600;

-- 2. GARANTE VALOR PADRÃO PARA REGISTROS EXISTENTES (caso coluna já existisse mas com valores nulos)
update public.confrontos
  set tempo_limite = 600
  where tempo_limite is null;

-- ==========================================
-- Instruções pós-execução:
-- Após executar no SQL Editor do Supabase Dashboard,
-- execute também: NOTIFY pgrst, 'reload schema';
-- para forçar o recarregamento do schema cache
-- ==========================================
