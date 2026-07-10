import type { SupabaseClient } from "@supabase/supabase-js"
import type { Pelada, PeladaOcorrencia, PeladaParticipante, ConfirmacaoDia, ListaEspera, HistoricoSorteio, SorteioModo } from "@/types"
import { PermissionService } from "./permission-service"

export class PeladaService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Cria uma nova pelada
   */
  async create(data: {
    nome: string
    descricao?: string
    limite_jogadores: number
    limite_por_ocorrencia?: number
    numero_times: number
    jogadores_por_time: number
    local?: string
    data?: string
    admin_id: string
    recorrente?: boolean
    dia_semana?: number | null
    horario?: string | null
  }): Promise<Pelada | null> {
    // Verifica se o usuário tem permissão de admin
    const permService = new PermissionService(this.supabase)
    await permService.assertCanCreatePelada(data.admin_id)

    // Gera um link de convite único
    const { data: linkData } = await this.supabase.rpc("gerar_link_convite")
    const link_convite = (linkData as string) || Math.random().toString(36).slice(2, 10)

    const { data: pelada } = await this.supabase
      .from("peladas")
      .insert({
        nome: data.nome,
        descricao: data.descricao,
        limite_jogadores: data.limite_jogadores,
        limite_por_ocorrencia: data.limite_por_ocorrencia || 25,
        numero_times: data.numero_times,
        jogadores_por_time: data.jogadores_por_time,
        local: data.local,
        data: data.data,
        admin_id: data.admin_id,
        link_convite,
        invite_code: link_convite,
        recorrente: data.recorrente || false,
        dia_semana: data.dia_semana || null,
        horario: data.horario || null,
      })
      .select()
      .single()

    if (pelada) {
      // Adiciona o admin como participante automaticamente
      await this.supabase.from("pelada_participantes").insert({
        pelada_id: pelada.id,
        user_id: data.admin_id,
        tipo: "mensalista",
      })
    }

    return pelada as Pelada | null
  }

  /**
   * Busca todas as peladas do usuário (como admin ou participante).
   * Usa RPC security definer para peladas como participante (bypassa RLS).
   */
  async getUserPeladas(userId: string): Promise<Pelada[]> {
    // Busca peladas onde o user é admin (query direta já funciona pelo RLS: admin vê própria pelada)
    const { data: adminPeladas } = await this.supabase
      .from("peladas")
      .select("*")
      .eq("admin_id", userId)
      .order("created_at", { ascending: false })

    // Busca IDs de peladas onde o user é participante
    const { data: participacoes } = await this.supabase
      .from("pelada_participantes")
      .select("pelada_id")
      .eq("user_id", userId)

    const adminIds = new Set((adminPeladas || []).map((p: any) => p.id))
    const participantIds = (participacoes || [])
      .map((p) => p.pelada_id)
      .filter((id) => !adminIds.has(id))

    let participantPeladas: Pelada[] = []
    if (participantIds.length > 0) {
      // Usa RPC security definer para bypassar RLS
      const { data } = await this.supabase.rpc("buscar_por_ids", {
        p_pelada_ids: participantIds,
      })

      participantPeladas = (data as Pelada[]) || []
    }

    // Mescla os resultados, admin primeiro
    return [...(adminPeladas as Pelada[]), ...participantPeladas]
  }

  /**
   * Busca peladas onde o usuário é participante
   */
  async getParticipantPeladas(userId: string): Promise<Pelada[]> {
    const { data: participacoes } = await this.supabase
      .from("pelada_participantes")
      .select("pelada_id")
      .eq("user_id", userId)

    if (!participacoes?.length) return []

    const peladaIds = participacoes.map((p) => p.pelada_id)

    const { data } = await this.supabase
      .from("peladas")
      .select("*")
      .in("id", peladaIds)
      .order("created_at", { ascending: false })

    return (data as Pelada[]) || []
  }

  /**
   * Busca pelada por ID.
   * Usa RPC security definer para bypassar RLS.
   * Garante que participantes recém-adicionados consigam ler a pelada.
   */
  async getById(peladaId: string): Promise<Pelada | null> {
    const { data } = await this.supabase.rpc("buscar_por_id", {
      p_pelada_id: peladaId,
    })

    return (data as Pelada) || null
  }

  /**
   * Busca pelada por link de convite.
   * Usa RPC security definer para bypassar RLS (usuários não-participantes podem ver pelo link).
   */
  async getByLink(link: string): Promise<Pelada | null> {
    const { data } = await this.supabase.rpc("buscar_por_link_convite", {
      p_link: link,
    })

    return (data as Pelada) || null
  }

  /**
   * Busca pelada por invite_code público (usa security definer function para bypassar RLS)
   */
  async getByInviteCode(inviteCode: string): Promise<Pelada | null> {
    const { data } = await this.supabase.rpc("buscar_por_invite_code", {
      p_invite_code: inviteCode,
    })

    return (data as Pelada) || null
  }

  /**
   * Atualiza uma pelada
   */
  async update(peladaId: string, updates: Partial<Pelada>): Promise<Pelada | null> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()
    if (!pelada) return null
    await permService.assertCanManagePelada((pelada as any).admin_id, peladaId)

    const { data } = await this.supabase
      .from("peladas")
      .update(updates)
      .eq("id", peladaId)
      .select()
      .single()

    return data as Pelada | null
  }

  /**
   * Deleta uma pelada
   */
  async delete(peladaId: string): Promise<void> {
    await this.supabase.from("peladas").delete().eq("id", peladaId)
  }

  /**
   * Promove o primeiro jogador da fila de espera.
   * Retorna o user_id do promovido ou null.
   */
  async promoverDaFila(peladaId: string, dataJogo: string): Promise<string | null> {
    const { data: promovidoId } = await this.supabase.rpc("promover_primeiro_fila", {
      p_pelada_id: peladaId,
      p_data: dataJogo,
    })

    return (promovidoId as string) || null
  }

  /**
   * Admin promove um jogador específico da fila de espera diretamente,
   * sem verificar limite de jogadores.
   */
  async adminPromoverDaFila(peladaId: string, userId: string, dataJogo: string): Promise<boolean> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()

    if (!pelada) return false
    const adminId = (pelada as any).admin_id
    await permService.assertCanManagePelada(adminId, peladaId)
    // Remove da lista de espera
    const { error: deleteError } = await this.supabase
      .from("lista_espera")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .eq("data_jogo", dataJogo)

    if (deleteError) return false

    // Atualiza confirmação para confirmado
    await this.supabase.from("confirmacoes_dia").upsert({
      pelada_id: peladaId,
      user_id: userId,
      data_jogo: dataJogo,
      status: "confirmado",
    }, {
      onConflict: "pelada_id, user_id, data_jogo",
    })

    // Reordena fila
    const fila = await this.getFilaEspera(peladaId, dataJogo)
    for (let i = 0; i < fila.length; i++) {
      await this.supabase
        .from("lista_espera")
        .update({ posicao: i + 1 })
        .eq("id", fila[i].id)
    }

    return true
  }

  // ==========================================
  // PARTICIPANTES
  // ==========================================

  /**
   * Lista participantes de uma pelada com seus perfis
   */
  async getParticipantes(peladaId: string): Promise<PeladaParticipante[]> {
    const { data } = await this.supabase
      .from("pelada_participantes")
      .select("*, profile:profiles(*)")
      .eq("pelada_id", peladaId)
      .order("created_at", { ascending: true })

    return (data as unknown as PeladaParticipante[]) || []
  }

  /**
   * Adiciona participante a uma pelada (via link de convite).
   * Usa RPC security definer para bypassar RLS.
   * Idempotente: retorna true se já é participante.
   * Retorna false se a pelada estiver lotada.
   */
  async addParticipante(peladaId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("adicionar_participante", {
      p_pelada_id: peladaId,
      p_user_id: userId,
    })

    if (error) {
      console.error("[PARTICIPANTE] Erro ao adicionar:", error)
      return false
    }

    return data === true
  }

  /**
   * Adiciona um membro à pelada independentemente do limite de vagas.
   * Usado no fluxo de convite quando a pelada está lotada.
   * Usa RPC security definer, idempotente.
   */
  async adicionarMembro(peladaId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("adicionar_membro_sem_limite", {
      p_pelada_id: peladaId,
      p_user_id: userId,
    })

    if (error) {
      console.error("[PARTICIPANTE] Erro ao adicionar membro:", error)
      return false
    }

    return data === true
  }

  /**
   * Remove participante de uma pelada
   */
  async removeParticipante(peladaId: string, userId: string): Promise<void> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()
    if (pelada) {
      await permService.assertCanManagePelada((pelada as any).admin_id, peladaId)
    }

    await this.supabase
      .from("pelada_participantes")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
  }

  /**
   * Altera o tipo do jogador (mensalista/diarista)
   */
  async alterarTipoJogador(peladaId: string, userId: string, tipo: "mensalista" | "diarista"): Promise<void> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()
    if (pelada) {
      await permService.assertCanManagePelada((pelada as any).admin_id, peladaId)
    }

    await this.supabase
      .from("pelada_participantes")
      .update({ tipo })
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
  }

  // ==========================================
  // CONFIRMAÇÕES
  // ==========================================

  /**
   * Verifica se o usuário é participante da pelada
   */
  private async isParticipante(peladaId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("pelada_participantes")
      .select("id")
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .single()

    return !!data
  }

  /**
   * Confirma presença para um dia específico.
   * Usa RPC transacional (com lock) para evitar race condition.
   * Regras:
   *   - Mensalistas sempre entram (prioridade)
   *   - Diaristas entram se houver vaga, senão vão para fila de espera
   *   - Participantes são ilimitados na pelada, apenas o limite por ocorrência conta
   */
  async confirmarPresenca(peladaId: string, userId: string, dataJogo: string, ocorrenciaId?: string): Promise<{ status: "confirmado" | "fila"; posicao?: number }> {
    const { data, error } = await this.supabase.rpc("confirmar_presenca_ocorrencia", {
      p_pelada_id: peladaId,
      p_user_id: userId,
      p_data_jogo: dataJogo,
      p_ocorrencia_id: ocorrenciaId || null,
    })

    if (error || !data) {
      console.error("[CONFIRMAR] Erro no RPC:", error)
      const errMsg = (data as any)?.error || error?.message || "Erro ao confirmar presença"
      throw new Error(errMsg)
    }

    const result = data as { status: string; posicao?: number; error?: string }
    if (result.error) {
      throw new Error(result.error)
    }

    return {
      status: result.status as "confirmado" | "fila",
      posicao: result.posicao,
    }
  }

  /**
   * Recusa presença para um dia específico.
   * Usa RPC transacional (com lock) que remove a confirmação
   * e promove automaticamente o primeiro da fila de espera.
   */
  async recusarPresenca(peladaId: string, userId: string, dataJogo: string, ocorrenciaId?: string): Promise<{ promovido: boolean; nomePromovido?: string }> {
    const { data, error } = await this.supabase.rpc("cancelar_presenca_ocorrencia", {
      p_pelada_id: peladaId,
      p_user_id: userId,
      p_data_jogo: dataJogo,
      p_ocorrencia_id: ocorrenciaId || null,
    })

    if (error) {
      console.error("[RECUSAR] Erro no RPC:", error)
      throw new Error("Erro ao recusar presença")
    }

    const result = data as { promovido: boolean; nome_promovido?: string; error?: string }
    if (result.error) {
      throw new Error(result.error)
    }

    return {
      promovido: result.promovido,
      nomePromovido: result.nome_promovido,
    }
  }

  /**
   * Admin confirma chegada do jogador
   */
  async confirmarChegada(peladaId: string, userId: string, dataJogo: string, ordem: number): Promise<void> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()

    if (!pelada) throw new Error("Pelada não encontrada")
    const adminId = (pelada as any).admin_id
    await permService.assertCanManagePelada(adminId, peladaId)

    await this.supabase
      .from("confirmacoes_dia")
      .update({ status: "confirmado", ordem_chegada: ordem })
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .eq("data_jogo", dataJogo)
  }

  /**
   * Busca confirmações de uma pelada em uma data
   */
  async getConfirmacoes(peladaId: string, dataJogo: string): Promise<ConfirmacaoDia[]> {
    const { data } = await this.supabase
      .from("confirmacoes_dia")
      .select("*, profile:profiles(*)")
      .eq("pelada_id", peladaId)
      .eq("data_jogo", dataJogo)
      .order("ordem_chegada", { ascending: true, nullsFirst: false })

    return (data as unknown as ConfirmacaoDia[]) || []
  }

  // ==========================================
  // LISTA DE ESPERA
  // ==========================================

  /**
   * Retorna a fila de espera completa para uma data, ordenada por posição
   */
  async getFilaEspera(peladaId: string, dataJogo: string): Promise<ListaEspera[]> {
    const { data } = await this.supabase
      .from("lista_espera")
      .select("*, profile:profiles(*)")
      .eq("pelada_id", peladaId)
      .eq("data_jogo", dataJogo)
      .order("posicao", { ascending: true })

    return (data as unknown as ListaEspera[]) || []
  }

  /**
   * Retorna a posição de um jogador na fila de espera (0 = não está na fila)
   */
  async getPosicaoFila(peladaId: string, userId: string, dataJogo: string): Promise<number> {
    const { data } = await this.supabase
      .from("lista_espera")
      .select("posicao")
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .eq("data_jogo", dataJogo)
      .single()

    return (data as any)?.posicao || 0
  }

  /**
   * Verifica se o jogador está na fila de espera
   */
  async isNaFila(peladaId: string, userId: string, dataJogo: string): Promise<boolean> {
    const posicao = await this.getPosicaoFila(peladaId, userId, dataJogo)
    return posicao > 0
  }

  /**
   * Remove um jogador da fila de espera
   */
  async sairFilaEspera(peladaId: string, userId: string, dataJogo: string): Promise<void> {
    await this.supabase
      .from("lista_espera")
      .delete()
      .eq("pelada_id", peladaId)
      .eq("user_id", userId)
      .eq("data_jogo", dataJogo)

    // Reordena posições da fila (fecha o buraco)
    const fila = await this.getFilaEspera(peladaId, dataJogo)
    for (let i = 0; i < fila.length; i++) {
      await this.supabase
        .from("lista_espera")
        .update({ posicao: i + 1 })
        .eq("id", fila[i].id)
    }
  }

  // ==========================================
  // SORTEIO
  // ==========================================

  /**
   * Realiza sorteio dos times
   */
  async realizarSorteio(
    peladaId: string,
    modo: SorteioModo,
    participantes: { user_id: string; nome: string; avatar_url: string | null; tipo: string }[],
    numeroTimes: number,
    jogadoresPorTime: number,
    ocorrenciaId?: string,
  ): Promise<HistoricoSorteio | null> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()

    if (!pelada) throw new Error("Pelada não encontrada")
    const adminId = (pelada as any).admin_id
    await permService.assertCanManagePelada(adminId, peladaId)

    const times = this.gerarTimes(participantes, modo, numeroTimes, jogadoresPorTime)

    const { data } = await this.supabase
      .from("historico_sorteios")
      .insert({
        pelada_id: peladaId,
        modo,
        times: JSON.stringify(times),
        ...(ocorrenciaId ? { pelada_ocorrencia_id: ocorrenciaId } : {}),
      })
      .select()
      .single()

    return data as HistoricoSorteio | null
  }

  /**
   * Algoritmo de geração de times
   */
  private gerarTimes(
    participantes: { user_id: string; nome: string; avatar_url: string | null; tipo: string }[],
    modo: SorteioModo,
    numeroTimes: number,
    jogadoresPorTime: number,
  ): { nome: string; jogadores: { user_id: string; nome: string; avatar_url: string | null }[] }[] {
    let jogadoresOrdenados = [...participantes]

    switch (modo) {
      case "aleatorio":
        // Fisher-Yates shuffle
        for (let i = jogadoresOrdenados.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [jogadoresOrdenados[i], jogadoresOrdenados[j]] = [jogadoresOrdenados[j], jogadoresOrdenados[i]]
        }
        break

      case "ordem_chegada":
        // Mantém a ordem (já deve vir ordenada da query)
        break

      case "priorizar_mensalistas":
        // Mensalistas primeiro, depois diaristas
        jogadoresOrdenados.sort((a, b) => {
          if (a.tipo === "mensalista" && b.tipo !== "mensalista") return -1
          if (a.tipo !== "mensalista" && b.tipo === "mensalista") return 1
          return Math.random() - 0.5
        })
        break

      case "equilibrado":
        // Distribuição serpentina: o melhor time pega o melhor jogador,
        // depois o último, etc. Como não temos rating, usamos aleatório
        // com distribuição uniforme
        for (let i = jogadoresOrdenados.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [jogadoresOrdenados[i], jogadoresOrdenados[j]] = [jogadoresOrdenados[j], jogadoresOrdenados[i]]
        }
        break
    }

    const nomesTimes = [
      "Time Azul", "Time Vermelho", "Time Verde", "Time Amarelo",
      "Time Roxo", "Time Laranja", "Time Rosa", "Time Cinza",
    ]

    const times: { nome: string; jogadores: { user_id: string; nome: string; avatar_url: string | null }[] }[] = []

    for (let i = 0; i < numeroTimes; i++) {
      times.push({
        nome: nomesTimes[i] || `Time ${i + 1}`,
        jogadores: [],
      })
    }

    // Distribuição serpentina
    jogadoresOrdenados.forEach((jogador, index) => {
      const timeIndex = index % numeroTimes
      if (times[timeIndex].jogadores.length < jogadoresPorTime) {
        times[timeIndex].jogadores.push({
          user_id: jogador.user_id,
          nome: jogador.nome,
          avatar_url: jogador.avatar_url,
        })
      }
    })

    return times
  }

  /**
   * Busca histórico de sorteios de uma pelada
   */
  async getHistoricoSorteios(peladaId: string): Promise<HistoricoSorteio[]> {
    const { data } = await this.supabase
      .from("historico_sorteios")
      .select("*")
      .eq("pelada_id", peladaId)
      .order("created_at", { ascending: false })

    return (data as HistoricoSorteio[]) || []
  }

  // ==========================================
  // OCORRÊNCIAS (Recorrência Semanal)
  // ==========================================

  /**
   * Obtém ou cria a próxima ocorrência para uma pelada recorrente
   */
  async getOrCreateProximaOcorrencia(peladaId: string): Promise<PeladaOcorrencia | null> {
    const { data } = await this.supabase.rpc("get_or_create_proxima_ocorrencia", {
      p_pelada_id: peladaId,
    })

    // A função v2 retorna { ocorrencia_id, ocorrencia_data } via OUT params
    const result = data as unknown as { ocorrencia_id: string; ocorrencia_data: string } | null
    if (!result?.ocorrencia_id) return null

    const { data: ocorrencia } = await this.supabase
      .from("pelada_ocorrencias")
      .select("*")
      .eq("id", result.ocorrencia_id)
      .single()

    return ocorrencia as PeladaOcorrencia | null
  }

  /**
   * Busca ocorrências de uma pelada
   */
  async getOcorrencias(peladaId: string): Promise<PeladaOcorrencia[]> {
    const { data } = await this.supabase
      .from("pelada_ocorrencias")
      .select("*")
      .eq("pelada_id", peladaId)
      .order("data", { ascending: false })

    return (data as PeladaOcorrencia[]) || []
  }

  /**
   * Busca a ocorrência aberta mais próxima
   */
  async getProximaOcorrencia(peladaId: string): Promise<PeladaOcorrencia | null> {
    const { data } = await this.supabase
      .from("pelada_ocorrencias")
      .select("*")
      .eq("pelada_id", peladaId)
      .eq("status", "aberta")
      .gte("data", new Date().toISOString().split("T")[0])
      .order("data", { ascending: true })
      .limit(1)
      .maybeSingle()

    return data as PeladaOcorrencia | null
  }

  /**
   * Encerra uma ocorrência
   */
  async encerrarOcorrencia(ocorrenciaId: string): Promise<void> {
    await this.supabase
      .from("pelada_ocorrencias")
      .update({ status: "encerrada" })
      .eq("id", ocorrenciaId)
  }

  /**
   * Cria uma ocorrência inicial para migração de dados
   */
  async criarOcorrenciaInicial(peladaId: string, data: string): Promise<PeladaOcorrencia | null> {
    const { data: ocorrencia } = await this.supabase.rpc("criar_ocorrencia_inicial", {
      p_pelada_id: peladaId,
      p_data: data,
    })

    if (!ocorrencia) return null

    const { data: result } = await this.supabase
      .from("pelada_ocorrencias")
      .select("*")
      .eq("id", ocorrencia as string)
      .single()

    return result as PeladaOcorrencia | null
  }

  /**
   * Atualiza a configuração de recorrência de uma pelada
   */
  async atualizarRecorrencia(
    peladaId: string,
    recorrente: boolean,
    dia_semana?: number | null,
    horario?: string | null,
  ): Promise<Pelada | null> {
    const updates: Record<string, unknown> = { recorrente }
    if (dia_semana !== undefined) updates.dia_semana = dia_semana
    if (horario !== undefined) updates.horario = horario

    const { data } = await this.supabase
      .from("peladas")
      .update(updates)
      .eq("id", peladaId)
      .select()
      .single()

    return data as Pelada | null
  }

  /**
   * Nomes dos dias da semana
   */
  static DIAS_SEMANA = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ]

  /**
   * Formata dia da semana para exibição
   */
  static formatarDiaSemana(dia: number): string {
    return PeladaService.DIAS_SEMANA[dia] || "—"
  }
}
