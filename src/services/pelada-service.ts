import type { SupabaseClient } from "@supabase/supabase-js"
import type { Pelada, PeladaOcorrencia, PeladaParticipante, ConfirmacaoDia, ListaEspera, HistoricoSorteio } from "@/types"
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

    const { data: pelada } = await this.supabase
      .from("peladas")
      .insert({
        nome: data.nome,
        descricao: data.descricao,
        limite_por_ocorrencia: data.limite_por_ocorrencia || 25,
        numero_times: data.numero_times,
        jogadores_por_time: data.jogadores_por_time,
        local: data.local,
        data: data.data,
        admin_id: data.admin_id,
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
    // Busca peladas onde o user é admin
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
      const { data } = await this.supabase.rpc("buscar_por_ids", {
        p_pelada_ids: participantIds,
      })

      participantPeladas = (data as Pelada[]) || []
    }

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
   */
  async getById(peladaId: string): Promise<Pelada | null> {
    const { data } = await this.supabase.rpc("buscar_por_id", {
      p_pelada_id: peladaId,
    })

    return (data as Pelada) || null
  }

  /**
   * Atualiza uma pelada
   */
  async update(peladaId: string, updates: Partial<Pelada>): Promise<Pelada | null> {
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

    // Atualiza confirmação para confirmado com hora_chegada
    await this.supabase.from("confirmacoes_dia").upsert({
      pelada_id: peladaId,
      user_id: userId,
      data_jogo: dataJogo,
      status: "confirmado",
      hora_chegada: new Date().toISOString(),
      ordem_chegada: (
        await this.supabase
          .from("confirmacoes_dia")
          .select("ordem_chegada")
          .eq("pelada_id", peladaId)
          .eq("data_jogo", dataJogo)
          .order("ordem_chegada", { ascending: false })
          .limit(1)
          .maybeSingle()
      )?.data?.ordem_chegada || 0 + 1,
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
   * Adiciona participante a uma pelada (apenas admin).
   * Usa RPC security definer para bypassar RLS.
   * Idempotente: retorna true se já é participante.
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
   * Remove participante de uma pelada
   */
  async removeParticipante(peladaId: string, userId: string): Promise<void> {
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
   * Altera o tipo do jogador (apenas informativo, não afeta prioridade)
   */
  async alterarTipoJogador(peladaId: string, userId: string, tipo: string): Promise<void> {
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
   * Jogador (ou admin) marca intenção de ir para a pelada.
   * Apenas status = 'pendente' — não define prioridade.
   */
  async confirmarIntencao(peladaId: string, userId: string, dataJogo: string, ocorrenciaId?: string): Promise<void> {
    const { data, error } = await this.supabase.rpc("confirmar_intencao", {
      p_pelada_id: peladaId,
      p_user_id: userId,
      p_data_jogo: dataJogo,
      p_ocorrencia_id: ocorrenciaId || null,
    })

    if (error) {
      console.error("[INTENCAO] Erro no RPC:", error)
      const errMsg = (data as any)?.error || error?.message || "Erro ao marcar intenção"
      throw new Error(errMsg)
    }

    const result = data as { error?: string }
    if (result.error) {
      throw new Error(result.error)
    }
  }

  /**
   * Admin confirma chegada do jogador (define prioridade real).
   * Usa RPC transacional com lock.
   * Se limite atingido, insere automaticamente na fila de espera.
   */
  async confirmarChegada(
    peladaId: string,
    userId: string,
    dataJogo: string,
    ocorrenciaId?: string,
  ): Promise<{ status: "confirmado" | "fila"; ordem_chegada?: number; confirmados?: number; limite?: number }> {
    const { data, error } = await this.supabase.rpc("confirmar_chegada", {
      p_pelada_id: peladaId,
      p_user_id: userId,
      p_data_jogo: dataJogo,
      p_ocorrencia_id: ocorrenciaId || null,
    })

    if (error) {
      console.error("[CHEGADA] Erro no RPC:", error)
      throw new Error(error.message)
    }

    const result = data as { status: string; ordem_chegada?: number; confirmados?: number; limite?: number; error?: string }
    if (result.error) {
      throw new Error(result.error)
    }

    return result as { status: "confirmado" | "fila"; ordem_chegada?: number; confirmados?: number; limite?: number }
  }

  /**
   * Recusa presença de um jogador.
   * Se estava confirmado, promove automaticamente o primeiro da fila de espera.
   */
  async recusarPresenca(
    peladaId: string,
    userId: string,
    dataJogo: string,
    ocorrenciaId?: string,
  ): Promise<{ promovido: boolean; nomePromovido?: string }> {
    const { data, error } = await this.supabase.rpc("recusar_presenca", {
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
   * Busca confirmações de uma pelada em uma data.
   * Ordenadas por ordem_chegada (primeiro confirmado = primeira chegada).
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
   * Realiza sorteio dos times usando exclusivamente ordem de chegada.
   * Apenas admin pode executar.
   */
  async realizarSorteio(
    peladaId: string,
    participantes: { user_id: string; nome: string; avatar_url: string | null }[],
    numeroTimes: number,
    jogadoresPorTime: number,
    ocorrenciaId?: string,
  ): Promise<HistoricoSorteio | null> {
    const permService = new PermissionService(this.supabase)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()

    if (!pelada) throw new Error("Pelada não encontrada")
    const adminId = (pelada as any).admin_id
    await permService.assertCanManagePelada(adminId, peladaId)

    const times = this.gerarTimes(participantes, numeroTimes, jogadoresPorTime)

    const { data } = await this.supabase
      .from("historico_sorteios")
      .insert({
        pelada_id: peladaId,
        modo: "ordem_chegada",
        times: JSON.stringify(times),
        ...(ocorrenciaId ? { pelada_ocorrencia_id: ocorrenciaId } : {}),
      })
      .select()
      .single()

    return data as HistoricoSorteio | null
  }

  /**
   * Algoritmo de geração de times baseado em ordem de chegada.
   * Os participantes já devem vir ordenados por hora_chegada ASC.
   * Distribuição serpentina para balancear os times.
   */
  private gerarTimes(
    participantes: { user_id: string; nome: string; avatar_url: string | null }[],
    numeroTimes: number,
    jogadoresPorTime: number,
  ): { nome: string; jogadores: { user_id: string; nome: string; avatar_url: string | null }[] }[] {
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

    // Distribuição serpentina baseada na ordem de chegada
    participantes.forEach((jogador, index) => {
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
