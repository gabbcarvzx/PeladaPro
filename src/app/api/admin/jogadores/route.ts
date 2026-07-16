import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import crypto from "crypto"

/**
 * POST /api/admin/jogadores — Criar novo jogador
 * PATCH /api/admin/jogadores — Editar nome do jogador
 * DELETE /api/admin/jogadores — Remover jogador da pelada
 */

const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gera um ID único curto, compatível com Node 18+ */
function gerarIdUnico(): string {
  // crypto.randomUUID() do módulo Node.js 'crypto' funciona em Node 18+
  return crypto.randomUUID().slice(0, 8)
}

/** Valida se uma string parece um UUID v4 */
function pareceUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Verifica se o usuário autenticado é admin da pelada.
 * Retorna { isAdmin, error, status }.
 */
async function verificarAdminPelada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  peladaId: string,
): Promise<{ isAdmin: boolean; error?: string; status?: number }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.log("[ADMIN-CHECK] getUser falhou:", authError?.message)
    return { isAdmin: false, error: "Não autenticado", status: 401 }
  }

  if (!pareceUUID(peladaId)) {
    return { isAdmin: false, error: "ID da pelada inválido", status: 400 }
  }

  const { data: pelada, error: peladaErr } = await supabase
    .from("peladas")
    .select("admin_id")
    .eq("id", peladaId)
    .single()

  if (peladaErr) {
    console.log("[ADMIN-CHECK] Erro ao buscar pelada:", peladaErr.message)
    // PGRST116 = row not found
    if (peladaErr.code === "PGRST116") {
      return { isAdmin: false, error: "Pelada não encontrada", status: 404 }
    }
    return { isAdmin: false, error: "Erro ao acessar pelada", status: 500 }
  }

  if (!pelada) {
    return { isAdmin: false, error: "Pelada não encontrada", status: 404 }
  }

  if (pelada.admin_id !== user.id) {
    return { isAdmin: false, error: "Apenas o admin da pelada pode gerenciar jogadores", status: 403 }
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single()

  if (profileErr || !profile) {
    console.log("[ADMIN-CHECK] Erro ao buscar profile:", profileErr?.message)
    return { isAdmin: false, error: "Perfil não encontrado", status: 404 }
  }

  const hasAdminRole = profile.role === "admin" || profile.email === SUPER_ADMIN_EMAIL
  if (!hasAdminRole) {
    return { isAdmin: false, error: "Você não tem permissão de admin", status: 403 }
  }

  return { isAdmin: true }
}

/** Busca participantes de uma pelada com seus nomes (via admin client) */
async function buscarParticipantesComNomes(peladaId: string) {
  const adminClient = getAdminClient()
  const { data, error } = await adminClient
    .from("pelada_participantes")
    .select("user_id, profile:profiles!inner(nome)")
    .eq("pelada_id", peladaId)

  if (error) {
    console.log("[BUSCAR-PARTICIPANTES] Erro:", error.message)
    return null
  }
  return data as unknown as { user_id: string; profile: { nome: string } }[] | null
}

// ---------------------------------------------------------------------------
// POST — Criar novo jogador
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const logTag = "[JOGADORES:POST]"
  console.log(`${logTag} INICIO`)

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log(`${logTag} Usuário não autenticado:`, authError?.message)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    console.log(`${logTag} USER: ${user.id} (${user.email})`)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      console.log(`${logTag} JSON inválido no body`)
      return NextResponse.json({ error: "Body inválido — JSON mal formatado" }, { status: 400 })
    }
    console.log(`${logTag} BODY:`, JSON.stringify(body))

    const { peladaId, nome, tipo } = body as {
      peladaId?: string
      nome?: string
      tipo?: string
    }

    if (!peladaId || !nome) {
      return NextResponse.json({ error: "peladaId e nome são obrigatórios" }, { status: 400 })
    }

    const nomeTrimmed = nome.trim()
    if (nomeTrimmed.length < 2) {
      return NextResponse.json({ error: "Nome deve ter pelo menos 2 caracteres" }, { status: 400 })
    }

    if (tipo && tipo !== "mensalista" && tipo !== "diarista") {
      return NextResponse.json({ error: "Tipo inválido. Use 'mensalista' ou 'diarista'" }, { status: 400 })
    }

    const check = await verificarAdminPelada(supabase, peladaId)
    if (!check.isAdmin) {
      console.log(`${logTag} Permissão negada:`, check.error)
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    // Verifica duplicação: nome já existe na pelada?
    const participantes = await buscarParticipantesComNomes(peladaId)
    if (participantes) {
      const duplicado = participantes.find(
        (p) => p.profile?.nome?.toLowerCase() === nomeTrimmed.toLowerCase(),
      )
      if (duplicado) {
        console.log(`${logTag} Nome duplicado: "${nomeTrimmed}"`)
        return NextResponse.json(
          { error: `Já existe um jogador com o nome "${nomeTrimmed}" nesta pelada` },
          { status: 409 },
        )
      }
    }

    // Gera email único
    const emailSlug = nomeTrimmed
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")

    const uniqueId = gerarIdUnico()
    const email = `jogador-${emailSlug}-${uniqueId}@peladapro.app`
    const password = crypto.randomUUID()

    // Cria auth user
    const adminClient = getAdminClient()
    console.log(`${logTag} Criando auth user: ${email}`)

    const { data: authUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nomeTrimmed },
    })

    if (createAuthError || !authUser?.user) {
      console.error(`${logTag} Erro ao criar auth user:`, createAuthError)
      // Erro específico de email duplicado (quase impossível, mas protege)
      if (createAuthError?.message?.includes("already exists") || createAuthError?.message?.includes("duplic")) {
        return NextResponse.json({ error: "Conflito: email já existe. Tente novamente." }, { status: 409 })
      }
      return NextResponse.json(
        { error: "Erro ao criar jogador: " + (createAuthError?.message || "erro desconhecido") },
        { status: 500 },
      )
    }

    const userId = authUser.user.id
    console.log(`${logTag} Auth user criado: ${userId}`)

    // Atualiza profile com nome correto
    const { error: updateProfileError } = await adminClient
      .from("profiles")
      .update({ nome: nomeTrimmed, tipo: tipo || "diarista" })
      .eq("id", userId)

    if (updateProfileError) {
      console.error(`${logTag} Erro ao atualizar profile:`, updateProfileError)
      // Não fatal — o trigger já deve ter criado o profile
    }

    // Adiciona como participante
    const { error: addError } = await adminClient
      .from("pelada_participantes")
      .insert({ pelada_id: peladaId, user_id: userId, tipo: tipo || "diarista" })

    if (addError) {
      console.error(`${logTag} Erro ao adicionar participante:`, addError)
      // Tenta limpar o auth user criado
      try { await adminClient.auth.admin.deleteUser(userId) } catch { /* ignora */ }
      if (addError.message?.includes("duplicate") || addError.message?.includes("already exists")) {
        return NextResponse.json({ error: "Jogador já é participante desta pelada" }, { status: 409 })
      }
      return NextResponse.json({ error: "Erro ao adicionar jogador à pelada" }, { status: 500 })
    }

    console.log(`${logTag} ✅ Jogador criado: ${userId} (${nomeTrimmed})`)

    return NextResponse.json({
      success: true,
      jogador: { id: userId, nome: nomeTrimmed, tipo: tipo || "diarista" },
    })
  } catch (error) {
    console.error(`${logTag} Erro interno:`, error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH — Editar nome do jogador
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  const logTag = "[JOGADORES:PATCH]"
  console.log(`${logTag} INICIO`)

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log(`${logTag} Não autenticado:`, authError?.message)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    console.log(`${logTag} USER: ${user.id}`)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }
    console.log(`${logTag} BODY:`, JSON.stringify(body))

    const { peladaId, userId, nome } = body as {
      peladaId?: string
      userId?: string
      nome?: string
    }

    if (!peladaId || !userId || !nome) {
      return NextResponse.json({ error: "peladaId, userId e nome são obrigatórios" }, { status: 400 })
    }

    const nomeTrimmed = nome.trim()
    if (nomeTrimmed.length < 2) {
      return NextResponse.json({ error: "Nome deve ter pelo menos 2 caracteres" }, { status: 400 })
    }

    const check = await verificarAdminPelada(supabase, peladaId)
    if (!check.isAdmin) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    // Verifica duplicação (excluindo o próprio usuário)
    const participantes = await buscarParticipantesComNomes(peladaId)
    if (participantes) {
      const duplicado = participantes.find(
        (p) => p.user_id !== userId && p.profile?.nome?.toLowerCase() === nomeTrimmed.toLowerCase(),
      )
      if (duplicado) {
        console.log(`${logTag} Nome duplicado: "${nomeTrimmed}"`)
        return NextResponse.json(
          { error: `Já existe outro jogador com o nome "${nomeTrimmed}"` },
          { status: 409 },
        )
      }
    }

    const adminClient = getAdminClient()
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ nome: nomeTrimmed })
      .eq("id", userId)

    if (updateError) {
      console.error(`${logTag} Erro ao atualizar:`, updateError)
      return NextResponse.json({ error: "Erro ao atualizar nome no banco" }, { status: 500 })
    }

    console.log(`${logTag} ✅ Nome atualizado: ${userId} → "${nomeTrimmed}"`)

    return NextResponse.json({ success: true, nome: nomeTrimmed })
  } catch (error) {
    console.error(`${logTag} Erro interno:`, error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE — Remover jogador da pelada
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  const logTag = "[JOGADORES:DELETE]"
  console.log(`${logTag} INICIO`)

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log(`${logTag} Não autenticado:`, authError?.message)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    console.log(`${logTag} USER: ${user.id}`)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }
    console.log(`${logTag} BODY:`, JSON.stringify(body))

    const { peladaId, userId } = body as { peladaId?: string; userId?: string }

    if (!peladaId || !userId) {
      return NextResponse.json({ error: "peladaId e userId são obrigatórios" }, { status: 400 })
    }

    const check = await verificarAdminPelada(supabase, peladaId)
    if (!check.isAdmin) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    // 🛡️ BLOQUEIA auto-remoção do admin da pelada
    if (userId === user.id) {
      console.warn(`${logTag} Admin tentou remover a si mesmo da pelada ${peladaId}`)
      return NextResponse.json(
        { error: "Você não pode remover a si mesmo da pelada. Transfira a administração primeiro." },
        { status: 409 },
      )
    }

    const adminClient = getAdminClient()
    const hoje = new Date().toISOString().split("T")[0]

    // Remove confirmações futuras
    const { error: errConfirmacoes } = await adminClient
      .from("confirmacoes_dia")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .gte("data_jogo", hoje)

    if (errConfirmacoes) {
      console.error(`${logTag} Erro ao limpar confirmações:`, errConfirmacoes)
    }

    // Remove da fila de espera
    const { error: errFila } = await adminClient
      .from("lista_espera")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)

    if (errFila) {
      console.error(`${logTag} Erro ao remover da fila:`, errFila)
    }

    // Remove da pelada
    const { error: errRemove } = await adminClient
      .from("pelada_participantes")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)

    if (errRemove) {
      console.error(`${logTag} Erro ao remover participante:`, errRemove)
      return NextResponse.json({ error: "Erro ao remover jogador da pelada" }, { status: 500 })
    }

    console.log(`${logTag} ✅ Jogador removido: ${userId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`${logTag} Erro interno:`, error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
