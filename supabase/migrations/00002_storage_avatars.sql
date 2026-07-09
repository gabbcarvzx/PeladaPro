-- ==========================================
-- PeladaPro - Storage para Avatars
-- ==========================================
-- Execute no SQL Editor do Supabase Dashboard
-- após criar o bucket manualmente OU use este SQL.
-- ==========================================

-- Criar bucket de avatars (se não existir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB em bytes
  array['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- ==========================================
-- RLS Policies para Storage
-- ==========================================

-- Habilitar RLS no bucket
alter table storage.objects enable row level security;

-- Qualquer um pode ver avatars (público)
create policy "Avatars são públicos"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Usuário autenticado pode fazer upload do seu próprio avatar
create policy "Usuário pode fazer upload do próprio avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Usuário pode atualizar seu próprio avatar
create policy "Usuário pode atualizar seu avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Usuário pode deletar seu próprio avatar
create policy "Usuário pode deletar seu avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
