-- ==========================================
-- PeladaPro - Adiciona posições do jogador
-- ==========================================
-- Adiciona campo posicoes (array de texto) ao
-- profiles para o Perfil Público do Jogador.
-- ==========================================

alter table public.profiles
  add column if not exists posicoes text[] not null default '{}';
