import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/admin/jogadores
 *
 * Cria um novo jogador na pelada.
 * Admin digita nome + tipo, o sistema cria um auth user + profile + participante.
 *
 * Body:
 *   { peladaId: string, nome: string, tipo?: string }
 *
 * PATCH /api/admin/jogadores
 *
 * Edita o nome de um jogador na pelada.
 *
 * Body:
 *   { peladaId: string, userId: string, nome: string }
 *
 * DELETE /api/admin/jogadores
 *
 * Remove um jogador da pelada (limpa confirmações e fila de espera).
 *
 * Body:
 *   { peladaId: string, userId: string }
 */

const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

/**
 * Verifica se o usuário autenticado é admin da pelada.
 * Retorna { isAdmin, error, status }
 */
async function verificarAdminPelada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  peladaId: string,
): Promise<{ isAdmin: boolean; error?: string; status?: number }> {
  // Verifica se o usuário existe
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { isAdmin: false, error: "Não autenticado", status: 401 }
  }

  // Verifica se é admin da pelada
  const { data: pelada } = await supabase
    .from("peladas")
    .select("admin_id")
    .eq("id", peladaId)
    .single()

  if (!pelada) {
    return { isAdmin: false, error: "Pelada não encontrada", status: 404 }
  }

  const peladaData = pelada as { admin_id: string }
  if (peladaData.admin_id !== userId) {
    return { isAdmin: false, error: "Apenas o admin da pelada pode gerenciar jogadores", status: 403 }
  }

  // Verifica se tem role de admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", userId)
    .single()

  const profileData = profile as { role?: string; email?: string } | null
  if (!profileData) {
    return { isAdmin: false, error: "Perfil não encontrado", status: 404 }
  }

  const hasAdminRole = profileData.role === "admin" || profileData.email === SUPER_ADMIN_EMAIL
  if (!hasAdminRole) {
    return { isAdmin: false, error: "Você não tem permissão de admin", status: 403 }
  }

  return { isAdmin: true }
}

/**
 * POST — Criar novo jogador
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { peladaId, nome, tipo } = body as { peladaId?: string; nome?: string; tipo?: string }

    // Validações
    if (!peladaId || !nome) {
      return NextResponse.json({ error: "peladaId e nome são obrigatórios" }, { status: 400 })
    }

    const nomeTrimmed = nome.trim()
    if (nomeTrimmed.length < 2) {
      return NextResponse.json({ error: "Nome deve ter pelo menos 2 caracteres" }, { status: 400 })
    }

    // Verifica admin
    const check = await verificarAdminPelada(supabase, user.id, peladaId)
    if (!check.isAdmin) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    // Verifica duplicação: já existe jogador com mesmo nome na pelada?
    const adminClient = getAdminClient()
    const { data: existentes } = await adminClient
      .from("pelada_participantes")
      .select("user_id, profile:profiles!inner(nome)")
      .eq("pelada_id", peladaId)

    const participantes = existentes as unknown as { user_id: string; profile: { nome: string } }[] | null
    if (participantes) {
      const duplicado = participantes.find(
        (p) => p.profile?.nome?.toLowerCase() === nomeTrimmed.toLowerCase(),
      )
      if (duplicado) {
        return NextResponse.json(
          { error: `Já existe um jogador com o nome "${nomeTrimmed}" nesta pelada` },
          { status: 409 },
        )
      }
    }

    // Gera email único baseado no nome
    const emailSlug = nomeTrimmed
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")

    const uniqueId = crypto.randomUUID().slice(0, 8)
    const email = `jogador-${emailSlug}-${uniqueId}@peladapro.app`
    const password = crypto.randomUUID()

    // Cria auth user (com service_role)
    const { data: authUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nomeTrimmed },
    })

    if (createAuthError || !authUser.user) {
      console.error("[JOGADORES] Erro ao criar auth user:", createAuthError)
      return NextResponse.json(
        { error: "Erro ao criar jogador: " + (createAuthError?.message || "erro desconhecido") },
        { status: 500 },
      )
    }

    // O trigger handle_new_user já cria o profile automaticamente.
    // Mas vamos garantir que o nome seja o correto.
    const { error: updateProfileError } = await adminClient
      .from("profiles")
      .update({ nome: nomeTrimmed, tipo: tipo || "diarista" })
      .eq("id", authUser.user.id)

    if (updateProfileError) {
      console.error("[JOGADORES] Erro ao atualizar profile:", updateProfileError)
    }

    // Adiciona como participante
    const { error: addError } = await adminClient
      .from("pelada_participantes")
      .insert({ pelada_id: peladaId, user_id: authUser.user.id, tipo: tipo || "diarista" })

    if (addError) {
      console.error("[JOGADORES] Erro ao adicionar participante:", addError)
      return NextResponse.json(
        { error: "Erro ao adicionar jogador à pelada" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      jogador: {
        id: authUser.user.id,
        nome: nomeTrimmed,
        tipo: tipo || "diarista",
      },
    })
  } catch (error) {
    console.error("[JOGADORES] Erro interno:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

/**
 * PATCH — Editar nome do jogador
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { peladaId, userId, nome } = body as { peladaId?: string; userId?: string; nome?: string }

    if (!peladaId || !userId || !nome) {
      return NextResponse.json(
        { error: "peladaId, userId e nome são obrigatórios" },
        { status: 400 },
      )
    }

    const nomeTrimmed = nome.trim()
    if (nomeTrimmed.length < 2) {
      return NextResponse.json({ error: "Nome deve ter pelo menos 2 caracteres" }, { status: 400 })
    }

    // Verifica admin
    const check = await verificarAdminPelada(supabase, user.id, peladaId)
    if (!check.isAdmin) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    // Verifica duplicação
    const adminClient = getAdminClient()
    const { data: existentes } = await adminClient
      .from("pelada_participantes")
      .select("user_id, profile:profiles!inner(nome)")
      .eq("pelada_id", peladaId)
      .neq("user_id", userId)

    const participantes = existentes as unknown as { user_id: string; profile: { nome: string } }[] | null
    if (participantes) {
      const duplicado = participantes.find(
        (p) => p.profile?.nome?.toLowerCase() === nomeTrimmed.toLowerCase(),
      )
      if (duplicado) {
        return NextResponse.json(
          { error: `Já existe um jogador com o nome "${nomeTrimmed}" nesta pelada` },
          { status: 409 },
        )
      }
    }

    // Atualiza nome no profile
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ nome: nomeTrimmed })
      .eq("id", userId)

    if (updateError) {
      console.error("[JOGADORES] Erro ao atualizar nome:", updateError)
      return NextResponse.json({ error: "Erro ao atualizar nome" }, { status: 500 })
    }

    return NextResponse.json({ success: true, nome: nomeTrimmed })
  } catch (error) {
    console.error("[JOGADORES] Erro interno:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

/**
 * DELETE — Remover jogador da pelada
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { peladaId, userId } = body as { peladaId?: string; userId?: string }

    if (!peladaId || !userId) {
      return NextResponse.json({ error: "peladaId e userId são obrigatórios" }, { status: 400 })
    }

    // Verifica admin
    const check = await verificarAdminPelada(supabase, user.id, peladaId)
    if (!check.isAdmin) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    const adminClient = getAdminClient()

    // Remove confirmações futuras
    const hoje = new Date().toISOString().split("T")[0]
    const { error: errConfirmacoes } = await adminClient
      .from("confirmacoes_dia")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .gte("data_jogo", hoje)

    if (errConfirmacoes) {
      console.error("[JOGADORES] Erro ao limpar confirmações:", errConfirmacoes)
    }

    // Remove da fila de espera
    const { error: errFila } = await adminClient
      .from("lista_espera")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)

    if (errFila) {
      console.error("[JOGADORES] Erro ao remover da fila:", errFila)
    }

    // Remove da pelada
    const { error: errRemove } = await adminClient
      .from("pelada_participantes")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)

    if (errRemove) {
      console.error("[JOGADORES] Erro ao remover participante:", errRemove)
      return NextResponse.json({ error: "Erro ao remover jogador" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[JOGADORES] Erro interno:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
