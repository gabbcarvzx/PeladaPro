-- =============================================
-- Migration 00011: last_payment_id para idempotência
-- =============================================
-- Adiciona coluna last_payment_id na tabela profiles
-- para garantir idempotência no processamento de webhooks.
--
-- Uso no webhook:
--   if profile.last_payment_id === payment.id → return 200 (já processado)
--   else → processa e atualiza last_payment_id = payment.id
-- =============================================

-- 1. Adiciona coluna last_payment_id na tabela profiles
alter table public.profiles
  add column if not exists last_payment_id text;

-- 2. Índice para busca rápida por asaas_customer_id (já usado no webhook)
create index if not exists idx_profiles_asaas_customer_id
  on public.profiles(asaas_customer_id);
