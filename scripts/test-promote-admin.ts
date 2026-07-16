/**
 * Script de Teste — Promoção a Admin
 *
 * Verifica que a correção (uso de service_role key) faz o
 * update de role persistir corretamente no banco.
 *
 * Uso:
 *   npx tsx scripts/test-promote-admin.ts
 *
 * Pré-requisitos:
 *   - .env.local com SUPABASE_SERVICE_ROLE_KEY configurada
 *   - Supabase local ou remoto acessível
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

// Carrega .env.local
config({ path: resolve(__dirname, "..", ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

async function main() {
  console.log("=".repeat(60))
  console.log("🧪 TESTE — Promoção a Admin (persistência pós-correção)")
  console.log("=".repeat(60))
  console.log()

  // ==========================================
  // 1. Verifica variáveis de ambiente
  // ==========================================
  console.log("📋 1. Verificando variáveis de ambiente...")

  if (!SUPABASE_URL) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL não configurada")
    process.exit(1)
  }
  if (!SUPABASE_ANON_KEY) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada")
    process.exit(1)
  }
  if (!SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY não configurada")
    console.log("\n   ➡️  Adicione no .env.local:")
    console.log("      SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role")
    console.log("\n   🔑 A chave está em: Supabase Dashboard > Settings > API > service_role key")
    process.exit(1)
  }

  console.log("✅ NEXT_PUBLIC_SUPABASE_URL: configurada")
  console.log("✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: configurada")
  console.log("✅ SUPABASE_SERVICE_ROLE_KEY: configurada")
  console.log()

  // Clientes
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // ==========================================
  // 2. Busca todos os usuários
  // ==========================================
  console.log("📋 2. Buscando usuários no banco...")

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, email, nome, role")
    .order("created_at", { ascending: false })

  if (profilesError) {
    console.error("❌ Erro ao buscar perfis:", profilesError.message)
    process.exit(1)
  }

  const users = profiles as { id: string; email: string; nome: string; role: string }[]
  console.log(`✅ ${users.length} usuários encontrados`)
  console.log()

  // ==========================================
  // 3. Identifica super admin
  // ==========================================
  const superAdmin = users.find((u) => u.email === SUPER_ADMIN_EMAIL)
  if (!superAdmin) {
    console.error("❌ Super admin não encontrado no banco!")
    console.log(`   Email esperado: ${SUPER_ADMIN_EMAIL}`)
    process.exit(1)
  }
  console.log(`👑 Super admin: ${superAdmin.nome} (${superAdmin.email}) — role: ${superAdmin.role}`)
  console.log()

  // ==========================================
  // 4. Encontra um usuário NÃO admin para testar
  // ==========================================
  const nonAdmin = users.find((u) => u.role !== "admin" && u.email !== SUPER_ADMIN_EMAIL)

  if (!nonAdmin) {
    console.log("⚠️  Nenhum usuário não-admin encontrado para testar.")
    console.log("   Vou criar um teste com o super admin mesmo...")
    console.log()

    // Se só existe super admin, testa com ele (redundante mas valida a rota)
    await testPromote(adminClient, superAdmin.id, "admin", true)
    return
  }

  console.log(`🎯 Alvo do teste: ${nonAdmin.nome} (${nonAdmin.email}) — role ATUAL: ${nonAdmin.role}`)
  console.log()

  // ==========================================
  // 5. TESTE A: Anon key NÃO deve conseguir promover (RLS bloqueia)
  // ==========================================
  console.log("─".repeat(60))
  console.log("🔴 TESTE A: Anon key tentando promover outro usuário (DEVE FALHAR)")
  console.log("─".repeat(60))

  const { error: anonError } = await anonClient
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", nonAdmin.id)

  // Verifica se o update silencioso ocorreu
  const { data: afterAnon } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", nonAdmin.id)
    .single()

  const roleAfterAnon = (afterAnon as { role: string } | null)?.role

  if (roleAfterAnon === "admin") {
    console.error("❌ FALHA: Anon key CONSEGUIU promover o usuário! RLS não está bloqueando!")
    process.exit(1)
  } else {
    console.log("✅ RLS bloqueou corretamente — role continua:", roleAfterAnon)
  }
  console.log()

  // ==========================================
  // 6. TESTE B: Service role DEVE conseguir promover (a correção)
  // ==========================================
  console.log("─".repeat(60))
  console.log("🟢 TESTE B: Service role promovendo usuário (DEVE FUNCIONAR)")
  console.log("─".repeat(60))

  const { error: promoteError } = await adminClient
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", nonAdmin.id)

  if (promoteError) {
    console.error("❌ FALHA: Service role NÃO conseguiu promover!", promoteError.message)
    process.exit(1)
  }

  // ==========================================
  // 7. VERIFICA PERSISTÊNCIA (SELECT pós-update)
  // ==========================================
  console.log("🔍 Verificando persistência (SELECT pós-update)...")

  const { data: verifyData } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", nonAdmin.id)
    .single()

  const verify = verifyData as { id: string; role: string } | null

  if (!verify) {
    console.error("❌ FALHA: Perfil não encontrado após update!")
    process.exit(1)
  }

  if (verify.role !== "admin") {
    console.error(`❌ FALHA: Role NÃO persistiu! Esperado=admin, Encontrado=${verify.role}`)
    process.exit(1)
  }

  console.log(`✅ Role persistiu corretamente: ${verify.role}`)
  console.log()

  // ==========================================
  // 8. TESTE C: Reverte para 'user'
  // ==========================================
  console.log("─".repeat(60))
  console.log("🔄 TESTE C: Revertendo role para 'user' (limpeza)")
  console.log("─".repeat(60))

  const { error: revertError } = await adminClient
    .from("profiles")
    .update({ role: "user" })
    .eq("id", nonAdmin.id)

  if (revertError) {
    console.error("❌ Erro ao reverter role:", revertError.message)
    process.exit(1)
  }

  const { data: revertVerify } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", nonAdmin.id)
    .single()

  const roleAfterRevert = (revertVerify as { role: string } | null)?.role

  if (roleAfterRevert !== "user") {
    console.error(`❌ FALHA: Reversão não funcionou! Esperado=user, Encontrado=${roleAfterRevert}`)
    process.exit(1)
  }

  console.log(`✅ Role revertida com sucesso: ${roleAfterRevert}`)
  console.log()

  // ==========================================
  // RESUMO
  // ==========================================
  console.log("=".repeat(60))
  console.log("✅✅✅ TODOS OS TESTES PASSARAM! ✅✅✅")
  console.log("=".repeat(60))
  console.log()
  console.log("📊 Resumo:")
  console.log(`   🔴 Anon key fazer update de outro usuário: BLOQUEADO (RLS)`)
  console.log(`   🟢 Service role fazer update: FUNCIONOU`)
  console.log(`   🟢 Persistência pós-update: CONFIRMADA`)
  console.log(`   🟢 Reversão: FUNCIONOU`)
  console.log()
  console.log("🚀 A correção está funcionando!")
}

main().catch((err) => {
  console.error("Erro inesperado:", err)
  process.exit(1)
})
