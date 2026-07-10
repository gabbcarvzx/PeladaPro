import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/admin/update-role
 *
 * Atualiza a role de um usuário (admin/user).
 * APENAS o super admin (gabrielcarvalhourspessoal@gmail.com) pode executar.
 *
 * Body:
 *   { userId: string, role: "admin" | "user" }
 *
 * Segurança:
 * 1. Verifica autenticação
 * 2. Verifica se é super admin pelo email
 * 3. Usa service_role key para BYPASSAR RLS no UPDATE
 * 4. Loga a ação
 * 5. Faz SELECT de verificação pós-update
 */
export async function POST(request: Request) {
  try {
    // ==========================================
    // 1. VERIFICA AUTENTICAÇÃO
    // ==========================================
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 },
      )
    }

    // ==========================================
    // 2. VERIFICA SE É SUPER ADMIN
    // ==========================================
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()

    const profileData = profile as { email?: string } | null
    const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

    if (!profileData || profileData.email !== SUPER_ADMIN_EMAIL) {
      console.warn(`[ADMIN] Tentativa de acesso negada: ${user.email} (${user.id})`)
      return NextResponse.json(
        { error: "Acesso restrito ao super admin" },
        { status: 403 },
      )
    }

    // ==========================================
    // 3. VALIDA BODY
    // ==========================================
    const body = await request.json()
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
    // Usa service_role para contar admins (pode ler todos os profiles)
    const adminClient = getAdminClient()

    if (role === "user") {
      const { count } = await adminClient
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin")

      if (count !== null && count <= 1) {
        return NextResponse.json(
          { error: "Não é possível remover o último administrador do sistema" },
          { status: 400 },
        )
      }
    }

    // ==========================================
    // 5. ATUALIZA ROLE (COM SERVICE ROLE — BYPASSA RLS)
    // ==========================================
    console.log(`[ADMIN] Super admin ${user.email} alterando role de ${userId} para ${role}`)

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", userId)

    if (updateError) {
      console.error(`[ADMIN] Erro ao atualizar role:`, updateError)
      return NextResponse.json(
        { error: "Erro ao atualizar role no banco: " + updateError.message },
        { status: 500 },
      )
    }

    // ==========================================
    // 6. VERIFICA PERSISTÊNCIA (SELECT pós-update)
    // ==========================================
    const { data: verifyData, error: verifyError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single()

    if (verifyError) {
      console.error(`[ADMIN] Erro ao verificar role após update:`, verifyError)
      return NextResponse.json(
        { error: "Role atualizada, mas falha ao verificar persistência. Verifique o banco." },
        { status: 500 },
      )
    }

    const verify = verifyData as { id: string; role: string } | null

    if (!verify || verify.role !== role) {
      console.error(`[ADMIN] ROLE NÃO PERSISTIU! Esperado=${role}, Encontrado=${verify?.role}`)
      return NextResponse.json(
        { error: "Role não foi persistida corretamente. Contate o suporte." },
        { status: 500 },
      )
    }

    console.log(`[ADMIN] ✅ Role de ${userId} alterada para ${role} (verificado: ${verify.role})`)

    return NextResponse.json({
      success: true,
      message: role === "admin" ? "Usuário promovido a admin!" : "Admin removido com sucesso!",
    })
  } catch (error) {
    console.error("[ADMIN] Erro interno:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    )
  }
}
