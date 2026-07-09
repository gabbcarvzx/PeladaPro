import type { SupabaseClient } from "@supabase/supabase-js"
import type { Pelada, PeladaParticipante, ConfirmacaoDia, HistoricoSorteio, SorteioModo } from "@/types"

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
    numero_times: number
    jogadores_por_time: number
    local?: string
    data?: string
    admin_id: string
  }): Promise<Pelada | null> {
    // Gera um link de convite único
    const { data: linkData } = await this.supabase.rpc("gerar_link_convite")
    const link_convite = (linkData as string) || Math.random().toString(36).slice(2, 10)

    const { data: pelada } = await this.supabase
      .from("peladas")
      .insert({
        ...data,
        link_convite,
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
   * Busca todas as peladas do usuário (como admin ou participante)
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

    const adminIds = new Set((adminPeladas || []).map((p) => p.id))
    const participantIds = (participacoes || [])
      .map((p) => p.pelada_id)
      .filter((id) => !adminIds.has(id))

    let participantPeladas: any[] = []
    if (participantIds.length > 0) {
      const { data } = await this.supabase
        .from("peladas")
        .select("*")
        .in("id", participantIds)
        .order("created_at", { ascending: false })
      participantPeladas = data || []
    }

    // Mescla os resultados, admin primeiro
    return [...(adminPeladas || []), ...participantPeladas] as Pelada[]
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
   * Busca pelada por ID
   */
  async getById(peladaId: string): Promise<Pelada | null> {
    const { data } = await this.supabase
      .from("peladas")
      .select("*")
      .eq("id", peladaId)
      .single()

    return data as Pelada | null
  }

  /**
   * Busca pelada por link de convite
   */
  async getByLink(link: string): Promise<Pelada | null> {
    const { data } = await this.supabase
      .from("peladas")
      .select("*")
      .eq("link_convite", link)
      .single()

    return data as Pelada | null
  }

  /**
   * Atualiza uma pelada
   */
  async update(peladaId: string, updates: Partial<Pelada>): Promise<Pelada | null> {
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
   * Adiciona participante a uma pelada (via link de convite)
   */
  async addParticipante(peladaId: string, userId: string): Promise<boolean> {
    // Verificar se a pelada tem vagas
    const pelada = await this.getById(peladaId)
    if (!pelada) return false

    const participantes = await this.getParticipantes(peladaId)
    if (participantes.length >= pelada.limite_jogadores) return false

    const { error } = await this.supabase.from("pelada_participantes").insert({
      pelada_id: peladaId,
      user_id: userId,
    })

    return !error
  }

  /**
   * Remove participante de uma pelada
   */
  async removeParticipante(peladaId: string, userId: string): Promise<void> {
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
   * Confirma presença para um dia específico
   */
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
   * Confirma presença para um dia específico
   */
  async confirmarPresenca(peladaId: string, userId: string, dataJogo: string): Promise<void> {
    if (!(await this.isParticipante(peladaId, userId))) {
      throw new Error("Você não é participante desta pelada")
    }

    await this.supabase.from("confirmacoes_dia").upsert({
      pelada_id: peladaId,
      user_id: userId,
      data_jogo: dataJogo,
      status: "confirmado",
    }, {
      onConflict: "pelada_id, user_id, data_jogo",
    })
  }

  /**
   * Recusa presença para um dia específico
   */
  async recusarPresenca(peladaId: string, userId: string, dataJogo: string): Promise<void> {
    if (!(await this.isParticipante(peladaId, userId))) {
      throw new Error("Você não é participante desta pelada")
    }

    await this.supabase.from("confirmacoes_dia").upsert({
      pelada_id: peladaId,
      user_id: userId,
      data_jogo: dataJogo,
      status: "recusado",
    }, {
      onConflict: "pelada_id, user_id, data_jogo",
    })
  }

  /**
   * Admin confirma chegada do jogador
   */
  async confirmarChegada(peladaId: string, userId: string, dataJogo: string, ordem: number): Promise<void> {
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
  ): Promise<HistoricoSorteio | null> {
    const times = this.gerarTimes(participantes, modo, numeroTimes, jogadoresPorTime)

    const { data } = await this.supabase
      .from("historico_sorteios")
      .insert({
        pelada_id: peladaId,
        modo,
        times: JSON.stringify(times),
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
}
