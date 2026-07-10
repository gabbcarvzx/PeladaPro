import { createClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase com service_role key.
 *
 * Bypassa todas as políticas de RLS.
 * Usado APENAS em endpoints seguros (server-side) onde
 * o usuário já foi verificado manualmente, como:
 *
 * - /api/admin/update-role — promover usuário a admin
 * - /api/webhooks/asaas — webhook de pagamento
 *
 * NUNCA use este cliente no frontend ou em rotas públicas!
 */
export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
