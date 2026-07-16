import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

/**
 * POST /api/admin/update-role
 *
 * Atualiza a role de um usuário (admin/user).
 * APENAS o super admin (gabrielcarvalhourspessoal@gmail.com) pode executar.
 *
 * Body:
 *   { userId: string, role: "admin" | "user" }
 */
export async function POST(request: Request) {
  const logTag = "[ADMIN-UPDATE-ROLE]"
  console.log(`${logTag} INICIO`)

  try {
    // ==========================================
    // 1. VERIFICA AUTENTICAÇÃO
    // ==========================================
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log(`${logTag} Não autenticado:`, authError?.message)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    console.log(`${logTag} USER: ${user.id} (${user.email})`)

    // ==========================================
    // 2. VERIFICA SE É SUPER ADMIN
    // ==========================================
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()

    if (profileErr || !profile) {
      console.log(`${logTag} Erro ao buscar profile:`, profileErr?.message)
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })
    }

    if (profile.email !== SUPER_ADMIN_EMAIL) {
      console.warn(`${logTag} Tentativa de acesso negada: ${user.email} (${user.id})`)
      return NextResponse.json({ error: "Acesso restrito ao super admin" }, { status: 403 })
    }

    // ==========================================
    // 3. VALIDA BODY
    // ==========================================
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }
    console.log(`${logTag} BODY:`, JSON.stringify(body))

    const { userId, role } = body as { userId?: string; role?: string }

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId e role são obrigatórios" },
        { status: 400 },
      )
    }

    if (role !== "admin" && role !== "user") {
      return NextResponse.json(
        { error: "Role inválida. Use 'admin' ou 'user'" },
        { status: 400 },
      )
    }

    // ==========================================
    // 4. SEGURANÇA: impede remover o ÚLTIMO admin
    // ==========================================
    const adminClient = getAdminClient()

    if (role === "user") {
      const { count } = await adminClient
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin")

      if (count !== null && count <= 1) {
        return NextResponse.json(
          { error: "Não é possível remover o último administrador do sistema" },
          { status: 409 },
        )
      }
    }

    // ==========================================
    // 5. ATUALIZA ROLE (COM SERVICE ROLE)
    // ==========================================
    console.log(`${logTag} Super admin ${user.email} alterando role de ${userId} para ${role}`)

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", userId)

    if (updateError) {
      console.error(`${logTag} Erro ao atualizar role:`, updateError)
      return NextResponse.json(
        { error: "Erro ao atualizar role no banco: " + updateError.message },
        { status: 500 },
      )
    }

    // ==========================================
    // 6. VERIFICA PERSISTÊNCIA
    // ==========================================
    const { data: verifyData, error: verifyError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single()

    if (verifyError) {
      console.error(`${logTag} Erro ao verificar role após update:`, verifyError)
      return NextResponse.json(
        { error: "Role atualizada, mas falha ao verificar persistência" },
        { status: 500 },
      )
    }

    if (!verifyData || verifyData.role !== role) {
      console.error(`${logTag} ROLE NÃO PERSISTIU! Esperado=${role}, Encontrado=${verifyData?.role}`)
      return NextResponse.json(
        { error: "Role não foi persistida corretamente" },
        { status: 500 },
      )
    }

    console.log(`${logTag} ✅ Role de ${userId} alterada para ${role} (verificado)`)

    return NextResponse.json({
      success: true,
      message: role === "admin" ? "Usuário promovido a admin!" : "Admin removido com sucesso!",
    })
  } catch (error) {
    console.error(`${logTag} Erro interno:`, error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
