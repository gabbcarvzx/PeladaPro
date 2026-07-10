import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
 * 3. Atualiza role no banco
 * 4. Loga a ação
 */
export async function POST(request: Request) {
  try {
    // 1. Verifica autenticação
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 },
      )
    }

    // 2. Verifica se é super admin
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

    // 3. Valida body
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

    // 4. Segurança: impede remover o ÚLTIMO admin
    if (role === "user") {
      const { count } = await supabase
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

    // 5. Atualiza role no banco
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId)

    if (updateError) {
      console.error(`[ADMIN] Erro ao atualizar role:`, updateError)
      return NextResponse.json(
        { error: "Erro ao atualizar role no banco" },
        { status: 500 },
      )
    }

    console.log(`[ADMIN] Super admin ${user.email} alterou role de ${userId} para ${role}`)

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
