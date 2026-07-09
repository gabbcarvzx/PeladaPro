-- ==========================================
-- PeladaPro - Habilitar Realtime para Confrontos
-- ==========================================
-- Executar no SQL Editor do Supabase Dashboard.
-- ==========================================

-- Habilita Realtime para a tabela confrontos
alter publication supabase_realtime add table public.confrontos;

-- Habilita Realtime para a tabela eventos_confronto
alter publication supabase_realtime add table public.eventos_confronto;
