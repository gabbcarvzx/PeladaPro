import type { SupabaseClient } from "@supabase/supabase-js"
import type { Confronto, EventoConfronto, TimeSorteioJogador, HistoricoSorteio } from "@/types"
import { PermissionService } from "./permission-service"

export class ConfrontoService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ==========================================
  // INICIAR CONFRONTOS
  // ==========================================

  /**
   * Inicia os confrontos a partir de um sorteio já realizado.
   * Cria a fila circular de times e gera o primeiro confronto.
   */
  async iniciarConfrontos(peladaId: string, sorteioId: string, tempoLimite?: number, ocorrenciaId?: string): Promise<Confronto | null> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    await permService.assertCanManagePelada(peladaId)

    // Busca o sorteio com os times
    const { data: sorteio } = await this.supabase
      .from("historico_sorteios")
      .select("*")
      .eq("id", sorteioId)
      .single()

    if (!sorteio) throw new Error("Sorteio não encontrado")

    const times = (sorteio as unknown as HistoricoSorteio).times
    if (!times || times.length < 2) throw new Error("São necessários pelo menos 2 times")

    // Verifica se já existem confrontos ativos para esta pelada
    const { data: existentes } = await this.supabase
      .from("confrontos")
      .select("id")
      .eq("pelada_id", peladaId)
      .eq("status", "em_andamento")

    if (existentes && existentes.length > 0) {
      throw new Error("Já existem confrontos em andamento para esta pelada")
    }

    // Fila circular: array de índices dos times
    // Cada item: { timeIndex, jogadores }
    type TimeFila = {
      nome: string
      jogadores: TimeSorteioJogador[]
    }

    const filaTimes: TimeFila[] = times.map((t) => ({
      nome: t.nome,
      jogadores: t.jogadores,
    }))

    // Salva a fila no banco para uso futuro
    // A fila salva como JSONB junto com os confrontos
    const filaJson = JSON.stringify(filaTimes)

    // Cria o primeiro confronto: time[0] vs time[1]
    const primeiro = await this.criarConfronto(
      peladaId,
      sorteioId,
      filaTimes[0],
      filaTimes[1],
      1,
      filaJson,
      tempoLimite,
      ocorrenciaId,
    )

    return primeiro
  }

  /**
   * Cria um confronto no banco
   */
  private async criarConfronto(
    peladaId: string,
    sorteioId: string,
    timeA: { nome: string; jogadores: TimeSorteioJogador[] },
    timeB: { nome: string; jogadores: TimeSorteioJogador[] },
    ordem: number,
    filaRestante?: string,
    tempoLimite?: number,
    ocorrenciaId?: string,
  ): Promise<Confronto | null> {
    const inserData: Record<string, unknown> = {
      pelada_id: peladaId,
      sorteio_id: sorteioId,
      time_a_nome: timeA.nome,
      time_b_nome: timeB.nome,
      time_a_jogadores: JSON.stringify(timeA.jogadores),
      time_b_jogadores: JSON.stringify(timeB.jogadores),
      ordem,
      tempo_limite: tempoLimite || 600,
      ...(ocorrenciaId ? { pelada_ocorrencia_id: ocorrenciaId } : {}),
    }

    if (filaRestante) {
      inserData.fila_restante = filaRestante
    }

    const { data } = await this.supabase
      .from("confrontos")
      .insert(inserData)
      .select()
      .single()

    return data as Confronto | null
  }

  // ==========================================
  // BUSCAR CONFRONTOS
  // ==========================================

  /**
   * Busca o confronto ativo (em_andamento) de uma pelada
   */
  async getConfrontoAtual(peladaId: string): Promise<Confronto | null> {
    const { data } = await this.supabase
      .from("confrontos")
      .select("*")
      .eq("pelada_id", peladaId)
      .eq("status", "em_andamento")
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle()

    return data as Confronto | null
  }

  /**
   * Busca todos os confrontos de uma pelada (histórico)
   */
  async getConfrontos(peladaId: string): Promise<Confronto[]> {
    const { data } = await this.supabase
      .from("confrontos")
      .select("*")
      .eq("pelada_id", peladaId)
      .order("ordem", { ascending: true })

    return (data as Confronto[]) || []
  }

  /**
   * Busca os confrontos finalizados de uma pelada
   */
  async getHistoricoConfrontos(peladaId: string): Promise<Confronto[]> {
    const { data } = await this.supabase
      .from("confrontos")
      .select("*")
      .eq("pelada_id", peladaId)
      .eq("status", "finalizado")
      .order("ordem", { ascending: true })

    return (data as Confronto[]) || []
  }

  /**
   * Busca um confronto específico
   */
  async getConfrontoById(confrontoId: string): Promise<Confronto | null> {
    const { data } = await this.supabase
      .from("confrontos")
      .select("*")
      .eq("id", confrontoId)
      .single()

    return data as Confronto | null
  }

  // ==========================================
  // EVENTOS (GOLS E ASSISTÊNCIAS)
  // ==========================================

  /**
   * Registra um gol e incrementa o placar
   */
  async marcarGol(
    confrontoId: string,
    jogadorId: string,
    timeId: "a" | "b",
  ): Promise<EventoConfronto | null> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)

    // Incrementa o placar via RPC
    await this.supabase.rpc("incrementar_placar", {
      p_confronto_id: confrontoId,
      p_time: timeId,
    })

    // Registra o evento
    const { data } = await this.supabase
      .from("eventos_confronto")
      .insert({
        confronto_id: confrontoId,
        jogador_id: jogadorId,
        tipo: "gol",
        time_id: timeId,
      })
      .select()
      .single()

    return data as EventoConfronto | null
  }

  /**
   * Registra uma assistência
   */
  async marcarAssistencia(
    confrontoId: string,
    jogadorId: string,
    timeId: "a" | "b",
  ): Promise<EventoConfronto | null> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)

    const { data } = await this.supabase
      .from("eventos_confronto")
      .insert({
        confronto_id: confrontoId,
        jogador_id: jogadorId,
        tipo: "assistencia",
        time_id: timeId,
      })
      .select()
      .single()

    return data as EventoConfronto | null
  }

  /**
   * Busca eventos de um confronto
   */
  async getEventos(confrontoId: string): Promise<EventoConfronto[]> {
    const { data } = await this.supabase
      .from("eventos_confronto")
      .select("*, profile:profiles(*)")
      .eq("confronto_id", confrontoId)
      .order("created_at", { ascending: true })

    return (data as unknown as EventoConfronto[]) || []
  }

  // ==========================================
  // FINALIZAR CONFRONTO
  // ==========================================

  /**
   * Finaliza o confronto atual e gera o próximo automaticamente.
   *
   * Regras:
   * - Se vencedor: vencedor permanece, perdedor sai, próximo da fila entra
   * - Se empate: ambos saem, entram os dois próximos da fila
   * - Se fila acabar: reinicia a ordem original
   */
  async finalizarConfronto(
    confrontoId: string,
    resultado: "time_a" | "time_b" | "empate",
  ): Promise<{ confrontoFinalizado: Confronto; proximoConfronto: Confronto | null }> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)

    const confronto = await this.getConfrontoById(confrontoId)
    if (!confronto) throw new Error("Confronto não encontrado")
    if (confronto.status !== "em_andamento") throw new Error("Confronto já finalizado")

    // Finaliza o confronto atual
    const { data: finalizado } = await this.supabase
      .from("confrontos")
      .update({
        status: "finalizado",
        resultado,
      })
      .eq("id", confrontoId)
      .select()
      .single()

    if (!finalizado) throw new Error("Erro ao finalizar confronto")

    // Busca a fila restante
    const filaRestante = this.parseFila(confronto)
    const vencedor = this.getVencedor(confronto, resultado)
    const tempoLimite = confronto.tempo_limite
    const ocorrenciaId = confronto.pelada_ocorrencia_id ?? undefined

    // Gera o próximo confronto
    let proximoConfronto: Confronto | null = null

    if (resultado === "empate") {
      // Ambos saem — puxa os dois próximos da fila
      const proximos = filaRestante.slice(0, 2)
      if (proximos.length >= 2) {
        // Remove os dois primeiros da fila
        const novaFila = filaRestante.slice(2)
        proximoConfronto = await this.criarConfronto(
          confronto.pelada_id,
          confronto.sorteio_id!,
          proximos[0],
          proximos[1],
          confronto.ordem + 1,
          JSON.stringify(novaFila),
          tempoLimite,
          ocorrenciaId,
        )
      } else if (proximos.length === 1) {
        // Só tem 1 time na fila — ele enfrenta o time A (que empatou) de volta
        // Na verdade, vamos reiniciar a ordem original
        const filaReiniciada = this.getFilaOriginalOuReinicia(confronto, filaRestante)
        if (filaReiniciada.length >= 2) {
          proximoConfronto = await this.criarConfronto(
            confronto.pelada_id,
            confronto.sorteio_id!,
            filaReiniciada[0],
            filaReiniciada[1],
            confronto.ordem + 1,
            JSON.stringify(filaReiniciada.slice(2)),
            tempoLimite,
            ocorrenciaId,
          )
        }
      } else {
        // Fila vazia — reinicia com os times originais
        const timesOriginais = this.getTimesOriginais(confronto)
        if (timesOriginais.length >= 2) {
          proximoConfronto = await this.criarConfronto(
            confronto.pelada_id,
            confronto.sorteio_id!,
            timesOriginais[0],
            timesOriginais[1],
            confronto.ordem + 1,
            JSON.stringify(timesOriginais.slice(2)),
            tempoLimite,
            ocorrenciaId,
          )
        }
      }
    } else {
      // Teve vencedor — vencedor fica, perdedor sai, próximo da fila entra
      const proximo = filaRestante.length > 0 ? filaRestante[0] : null
      const novaFila = filaRestante.slice(1)

      if (proximo) {
        proximoConfronto = await this.criarConfronto(
          confronto.pelada_id,
          confronto.sorteio_id!,
          vencedor!,
          proximo,
          confronto.ordem + 1,
          JSON.stringify(novaFila),
          tempoLimite,
          ocorrenciaId,
        )
      } else {
        // Fila vazia — reinicia com os times originais (vencedor + alguém)
        const timesOriginais = this.getTimesOriginais(confronto)
        // Remove o vencedor e o perdedor dos originais pra não repetir
        const vencedorNome = vencedor?.nome
        const perdedorNome = resultado === "time_a" ? confronto.time_b_nome : confronto.time_a_nome
        const restantes = timesOriginais.filter(
          (t) => t.nome !== vencedorNome && t.nome !== perdedorNome,
        )

        if (restantes.length > 0) {
          proximoConfronto = await this.criarConfronto(
            confronto.pelada_id,
            confronto.sorteio_id!,
            vencedor!,
            restantes[0],
            confronto.ordem + 1,
            JSON.stringify(restantes.slice(1)),
            tempoLimite,
            ocorrenciaId,
          )
        } else {
          // Só tem 1 time restante — reinicia tudo
          const filaReiniciada = this.getFilaOriginalOuReinicia(confronto, [])
          if (filaReiniciada.length >= 2) {
            proximoConfronto = await this.criarConfronto(
              confronto.pelada_id,
              confronto.sorteio_id!,
              filaReiniciada[0],
              filaReiniciada[1],
              confronto.ordem + 1,
              JSON.stringify(filaReiniciada.slice(2)),
              tempoLimite,
              ocorrenciaId,
            )
          }
        }
      }
    }

    return {
      confrontoFinalizado: finalizado as Confronto,
      proximoConfronto,
    }
  }

  // ==========================================
  // MÉTODOS AUXILIARES
  // ==========================================

  /**
   * Retorna o time vencedor com base no resultado
   */
  private getVencedor(
    confronto: Confronto,
    resultado: "time_a" | "time_b" | "empate",
  ): { nome: string; jogadores: TimeSorteioJogador[] } | null {
    if (resultado === "time_a") {
      return {
        nome: confronto.time_a_nome,
        jogadores: this.parseJogadores(confronto.time_a_jogadores),
      }
    }
    if (resultado === "time_b") {
      return {
        nome: confronto.time_b_nome,
        jogadores: this.parseJogadores(confronto.time_b_jogadores),
      }
    }
    return null
  }

  /**
   * Parseia o JSON de jogadores
   */
  private parseJogadores(jogadores: unknown): TimeSorteioJogador[] {
    if (Array.isArray(jogadores)) return jogadores as TimeSorteioJogador[]
    try {
      return JSON.parse(jogadores as string) as TimeSorteioJogador[]
    } catch {
      return []
    }
  }

  /**
   * Parseia a fila restante de um confronto
   */
  private parseFila(confronto: Confronto): { nome: string; jogadores: TimeSorteioJogador[] }[] {
    if (!confronto.fila_restante) return []
    try {
      return JSON.parse(confronto.fila_restante) as { nome: string; jogadores: TimeSorteioJogador[] }[]
    } catch {
      return []
    }
  }

  /**
   * Obtém os times originais do sorteio a partir do primeiro confronto da sequência
   * ou reinicia a fila se não houver mais nenhum
   */
  private getFilaOriginalOuReinicia(
    confronto: Confronto,
    filaAtual: { nome: string; jogadores: TimeSorteioJogador[] }[],
  ): { nome: string; jogadores: TimeSorteioJogador[] }[] {
    // Se temos times na fila atual, eles são nossa base
    if (filaAtual.length >= 2) return filaAtual

    // Reconstroi a partir dos times A e B + fila
    const resultado = []
    const jaVistos = new Set<string>()

    // Time A do confronto atual
    const timeA = {
      nome: confronto.time_a_nome,
      jogadores: this.parseJogadores(confronto.time_a_jogadores),
    }
    jaVistos.add(timeA.nome)

    // Time B do confronto atual
    const timeB = {
      nome: confronto.time_b_nome,
      jogadores: this.parseJogadores(confronto.time_b_jogadores),
    }
    jaVistos.add(timeB.nome)

    // Times da fila
    for (const t of filaAtual) {
      if (!jaVistos.has(t.nome)) {
        resultado.push(t)
        jaVistos.add(t.nome)
      }
    }

    return [timeA, timeB, ...resultado]
  }

  /**
   * Verifica se o admin do confronto tem permissão de admin
   */
  private async verificarAdminPermissao(confrontoId: string): Promise<void> {
    const confronto = await this.getConfrontoById(confrontoId)
    if (!confronto) throw new Error("Confronto não encontrado")

    const permService = new PermissionService(this.supabase)
    await permService.assertCanManagePelada(confronto.pelada_id)
  }

  /**
   * Obtém todos os times originais do sorteio
   * Busca no primeiro confronto da pelada que tem a fila completa
   */
  private getTimesOriginais(
    confronto: Confronto,
  ): { nome: string; jogadores: TimeSorteioJogador[] }[] {
    const timeA = {
      nome: confronto.time_a_nome,
      jogadores: this.parseJogadores(confronto.time_a_jogadores),
    }
    const timeB = {
      nome: confronto.time_b_nome,
      jogadores: this.parseJogadores(confronto.time_b_jogadores),
    }
    const fila = this.parseFila(confronto)

    return [timeA, timeB, ...fila]
  }

  // ==========================================
  // TIMER
  // ==========================================

  /**
   * Inicia/resume o timer de um confronto
   */
  async iniciarTimer(confrontoId: string, tempoRestante?: number): Promise<Confronto | null> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)
    const update: Record<string, unknown> = {
      iniciado_em: new Date().toISOString(),
    }
    if (tempoRestante !== undefined) {
      update.tempo_restante = tempoRestante
    }

    const { data } = await this.supabase
      .from("confrontos")
      .update(update)
      .eq("id", confrontoId)
      .select()
      .single()

    return data as Confronto | null
  }

  /**
   * Pausa o timer de um confronto, salvando o tempo restante
   */
  async pausarTimer(confrontoId: string): Promise<Confronto | null> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)
    const confronto = await this.getConfrontoById(confrontoId)
    if (!confronto || !confronto.iniciado_em) {
      throw new Error("Timer não está rodando")
    }

    const tempoLimite = confronto.tempo_restante || confronto.tempo_limite
    const inicio = new Date(confronto.iniciado_em).getTime()
    const decorrido = Math.floor((Date.now() - inicio) / 1000)
    const restante = Math.max(0, tempoLimite - decorrido)

    const { data } = await this.supabase
      .from("confrontos")
      .update({
        iniciado_em: null,
        tempo_restante: restante,
      })
      .eq("id", confrontoId)
      .select()
      .single()

    return data as Confronto | null
  }

  /**
   * Reseta o timer de um confronto para o tempo limite original
   */
  async resetarTimer(confrontoId: string): Promise<Confronto | null> {
    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)
    const { data } = await this.supabase
      .from("confrontos")
      .update({
        iniciado_em: null,
        tempo_restante: null,
      })
      .eq("id", confrontoId)
      .select()
      .single()

    return data as Confronto | null
  }

  /**
   * Finaliza uma rodada de confrontos (último confronto, sem próximo)
   */
  async finalizarRodada(peladaId: string): Promise<void> {
    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    await permService.assertCanManagePelada(peladaId)
    await this.supabase
      .from("confrontos")
      .update({ status: "finalizado", resultado: "empate" })
      .eq("pelada_id", peladaId)
      .eq("status", "em_andamento")
  }
}
