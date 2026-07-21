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
    console.log("[CONFRONTO] iniciarConfrontos chamado", { peladaId, sorteioId, tempoLimite, ocorrenciaId })

    // Proteção: verifica se o admin tem permissão
    const permService = new PermissionService(this.supabase)
    await permService.assertCanManagePelada(peladaId)

    // Busca o sorteio com os times
    const { data: sorteio, error: errSorteio } = await this.supabase
      .from("historico_sorteios")
      .select("*")
      .eq("id", sorteioId)
      .single()

    if (errSorteio || !sorteio) {
      console.error("[CONFRONTO] Erro ao buscar sorteio:", errSorteio)
      throw new Error("Sorteio não encontrado")
    }

    // 🛡️ Parseia times: registros antigos podem ter string no lugar de array
    const timesRaw = (sorteio as unknown as HistoricoSorteio).times
    console.log("[CONFRONTO] timesRaw type:", typeof timesRaw, Array.isArray(timesRaw) ? "array" : typeof timesRaw)
    const times = this.parseTimes(timesRaw)
    console.log("[CONFRONTO] times parsed:", times.length, "times")
    if (times.length < 2) throw new Error("São necessários pelo menos 2 times")

    console.log(`[CONFRONTO] Iniciando confrontos: ${times.length} times: ${times.map(t => t.nome).join(", ")}`)

    // Verifica se já existem confrontos ativos para esta pelada
    const { data: existentes, error: errExistentes } = await this.supabase
      .from("confrontos")
      .select("id")
      .eq("pelada_id", peladaId)
      .eq("status", "em_andamento")

    if (errExistentes) {
      console.error("[CONFRONTO] Erro ao verificar existentes:", errExistentes)
      throw new Error(`Erro ao verificar confrontos existentes: ${errExistentes.message}`)
    }

    if (existentes && existentes.length > 0) {
      throw new Error("Já existem confrontos em andamento para esta pelada")
    }

    // Fila circular: array de times
    type TimeFila = {
      nome: string
      jogadores: TimeSorteioJogador[]
    }

    const filaTimes: TimeFila[] = times.map((t) => ({
      nome: t.nome,
      jogadores: t.jogadores,
    }))

    // 🐛 BUG FIX: A fila deve conter APENAS os times restantes (excluindo os 2 primeiros que jogam)
    const filaInicial = filaTimes.slice(2)

    console.log(`[CONFRONTO] 1º confronto: ${filaTimes[0].nome} vs ${filaTimes[1].nome}, fila: ${filaInicial.map(t => t.nome).join(", ")}`)

    // Cria o primeiro confronto
    const primeiro = await this.criarConfronto(
      peladaId,
      sorteioId,
      filaTimes[0],
      filaTimes[1],
      1,
      filaInicial, // Array direto — fila_restante é jsonb
      tempoLimite,
      ocorrenciaId,
    )

    return primeiro
  }

  /**
   * Gera confronto simplificado a partir de dados já parseados.
   * Usado como fallback quando iniciarConfrontos padrão falha.
   * Recebe os times já parseados (array) e cria o primeiro confronto.
   */
  async gerarConfrontoSimplificado(
    peladaId: string,
    times: { nome: string; jogadores: TimeSorteioJogador[] }[],
    tempoLimite?: number,
    ocorrenciaId?: string,
  ): Promise<Confronto | null> {
    const logTag = "[GERAR-CONFRONTO-SIMPLIFICADO]"
    console.log(`${logTag} Gerando confronto para ${times.length} times`)

    const permService = new PermissionService(this.supabase)
    await permService.assertCanManagePelada(peladaId)

    if (times.length < 2) throw new Error("São necessários pelo menos 2 times")

    // Verifica se já existem confrontos ativos
    const { data: existentes } = await this.supabase
      .from("confrontos")
      .select("id")
      .eq("pelada_id", peladaId)
      .eq("status", "em_andamento")

    if (existentes && existentes.length > 0) {
      throw new Error("Já existem confrontos em andamento para esta pelada")
    }

    // Busca o último sorteio para obter o ID
    const { data: ultimoSorteio } = await this.supabase
      .from("historico_sorteios")
      .select("id")
      .eq("pelada_id", peladaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const sorteioId = ultimoSorteio?.id || null

    // Fila restante = times excluindo os 2 primeiros
    const filaRestante = times.slice(2)

    // Cria o primeiro confronto com time[0] vs time[1]
    // sorteioId pode ser null (sem sorteio encontrado) — coluna aceita null
    const confronto = await this.criarConfronto(
      peladaId,
      sorteioId, // pode ser null — FK aceita null
      {
        nome: times[0].nome,
        jogadores: times[0].jogadores,
      },
      {
        nome: times[1].nome,
        jogadores: times[1].jogadores,
      },
      1,
      filaRestante, // Array direto para jsonb
      tempoLimite,
      ocorrenciaId,
    )

    return confronto
  }

  /**
   * Cria um confronto no banco
   */
  private async criarConfronto(
    peladaId: string,
    sorteioId: string | null,
    timeA: { nome: string; jogadores: TimeSorteioJogador[] },
    timeB: { nome: string; jogadores: TimeSorteioJogador[] },
    ordem: number,
    filaRestante?: { nome: string; jogadores: TimeSorteioJogador[] }[],
    tempoLimite?: number,
    ocorrenciaId?: string,
  ): Promise<Confronto | null> {
    const logTag = "[CRIAR-CONFRONTO]"
    const inserData: Record<string, unknown> = {
      pelada_id: peladaId,
      sorteio_id: sorteioId,
      time_a_nome: timeA.nome,
      time_b_nome: timeB.nome,
      time_a_jogadores: timeA.jogadores,
      time_b_jogadores: timeB.jogadores,
      ordem,
      tempo_limite: tempoLimite || 600,
      ...(ocorrenciaId ? { pelada_ocorrencia_id: ocorrenciaId } : {}),
    }

    if (filaRestante && filaRestante.length > 0) {
      inserData.fila_restante = filaRestante // Array direto — coluna é jsonb
    }

    console.log(`${logTag} Inserindo confronto: ${timeA.nome} vs ${timeB.nome}, fila=${filaRestante?.length || 0} times`)

    const { data, error } = await this.supabase
      .from("confrontos")
      .insert(inserData)
      .select()
      .single()

    if (error) {
      console.error(`${logTag} Erro ao inserir:`, error)
      throw new Error(`Erro ao criar confronto: ${error.message}`)
    }

    console.log(`${logTag} Confronto criado: ${data?.id}`)
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
  // FINALIZAR CONFRONTO (TRANSACTIONAL via RPC)
  // ==========================================
  //
  // A lógica de rotação roda em Node.js (onde é mais fácil de manter),
  // mas a finalização + inserção do próximo confronto é EXECUTADA
  // DENTRO DE UM RPC PostgreSQL com FOR UPDATE lock, garantindo
  // atomicidade: ou ambos acontecem, ou nenhum.
  //
  // Regras:
  // - Se vencedor: vencedor permanece, perdedor sai, próximo da fila entra
  // - Se empate: ambos saem, entram os dois próximos da fila
  // - Se fila acabar: encerra rodada (não cria próximo)
  // ==========================================

  async finalizarConfronto(
    confrontoId: string,
    resultado: "time_a" | "time_b" | "empate",
  ): Promise<{ confrontoFinalizado: Confronto; proximoConfronto: Confronto | null }> {
    const logTag = "[FINALIZAR-CONFRONTO]"
    console.log(`${logTag} INICIO: confrontoId=${confrontoId}, resultado=${resultado}`)

    // Proteção: verifica se o admin tem permissão
    await this.verificarAdminPermissao(confrontoId)

    const confronto = await this.getConfrontoById(confrontoId)
    if (!confronto) throw new Error("Confronto não encontrado")
    if (confronto.status !== "em_andamento") throw new Error("Confronto já finalizado")

    // ==========================================
    // LÓGICA DE ROTAÇÃO CIRCULAR (Node.js)
    // ==========================================
    //
    // Exemplo com 5 times [A, B, C, D, E]:
    //   Fila inicial (após 1º confronto A x B): [C, D, E]
    //
    // Vitória de A sobre B:
    //   A permanece, B vai para o FINAL da fila
    //   Próximo da fila (C) entra para enfrentar A
    //   Nova fila: [D, E, B]
    //
    // Empate A x B:
    //   Ambos saem, C e D entram
    //   A e B vão para o FINAL da fila
    //   Nova fila: [E, A, B]
    //
    // 🛡️ Se fila vazia → encerra rodada (sem próximo confronto)
    //    Evita ciclo infinito de mesmos times.
    // ==========================================

    const filaRestante = this.parseFila(confronto)

    console.log(`${logTag} Fila atual: [${filaRestante.map(t => t.nome).join(", ")}]`)

    // Prepara dados do próximo confronto (se houver)
    let proximoData: Record<string, unknown> | null = null

    if (resultado === "empate") {
      const timeA = {
        nome: confronto.time_a_nome,
        jogadores: this.parseJogadores(confronto.time_a_jogadores),
      }
      const timeB = {
        nome: confronto.time_b_nome,
        jogadores: this.parseJogadores(confronto.time_b_jogadores),
      }

      if (filaRestante.length >= 2) {
        const entrantes = filaRestante.slice(0, 2)
        const novaFila = [...filaRestante.slice(2), timeA, timeB]

        console.log(`${logTag} EMPATE: ${timeA.nome} e ${timeB.nome} saem, ${entrantes[0].nome} vs ${entrantes[1].nome}`)
        console.log(`${logTag} Nova fila: [${novaFila.map(t => t.nome).join(", ")}]`)

        proximoData = {
          time_a_nome: entrantes[0].nome,
          time_b_nome: entrantes[1].nome,
          time_a_jogadores: entrantes[0].jogadores,
          time_b_jogadores: entrantes[1].jogadores,
          fila_restante: novaFila,
          ordem: confronto.ordem + 1,
        }
      } else if (filaRestante.length === 1) {
        const entrante = filaRestante[0]
        const novaFila = [timeB]

        console.log(`${logTag} EMPATE (fila=1): ${timeA.nome} vs ${entrante.nome}, fila: [${novaFila.map(t => t.nome).join(", ")}]`)

        proximoData = {
          time_a_nome: timeA.nome,
          time_b_nome: entrante.nome,
          time_a_jogadores: timeA.jogadores,
          time_b_jogadores: entrante.jogadores,
          fila_restante: novaFila,
          ordem: confronto.ordem + 1,
        }
      } else {
        // 🛡️ FILA VAZIA: encerra rodada
        console.log(`${logTag} EMPATE (fila vazia): encerrando rodada`)
      }
    } else {
      const vencedor = this.getVencedor(confronto, resultado)!
      const perdedorNome = resultado === "time_a" ? confronto.time_b_nome : confronto.time_a_nome
      const perdedor = {
        nome: perdedorNome,
        jogadores: this.parseJogadores(
          resultado === "time_a" ? confronto.time_b_jogadores : confronto.time_a_jogadores,
        ),
      }

      if (filaRestante.length >= 1) {
        const entrante = filaRestante[0]
        const novaFila = [...filaRestante.slice(1), perdedor]

        console.log(`${logTag} VITÓRIA: ${vencedor.nome} vence, ${perdedor.nome} vai pro final, ${entrante.nome} entra`)
        console.log(`${logTag} Nova fila: [${novaFila.map(t => t.nome).join(", ")}]`)

        proximoData = {
          time_a_nome: vencedor.nome,
          time_b_nome: entrante.nome,
          time_a_jogadores: vencedor.jogadores,
          time_b_jogadores: entrante.jogadores,
          fila_restante: novaFila,
          ordem: confronto.ordem + 1,
        }
      } else {
        // 🛡️ FILA VAZIA: encerra rodada
        console.log(`${logTag} VITÓRIA (fila vazia): encerrando rodada`)
      }
    }

    // ==========================================
    // CHAMA RPC TRANSACTIONAL
    // finalizar_confronto faz TUDO em uma transação:
    //   1. FOR UPDATE lock no confronto
    //   2. UPDATE status='finalizado'
    //   3. INSERT do próximo confronto (se houver)
    // ==========================================
    const { data: rpcResult, error: rpcError } = await this.supabase.rpc(
      "finalizar_confronto",
      {
        p_confronto_id: confrontoId,
        p_resultado: resultado,
        p_proximo_jsonb: proximoData as Record<string, unknown> | null,
      },
    )

    if (rpcError) {
      console.error(`${logTag} Erro no RPC finalizar_confronto:`, rpcError)
      throw new Error(`Erro ao finalizar confronto: ${rpcError.message}`)
    }

    const result = rpcResult as { finalizado_id?: string; proximo_id?: string | null; error?: string }

    if (result.error) {
      console.error(`${logTag} Erro retornado pelo RPC:`, result.error)
      throw new Error(result.error)
    }

    console.log(`${logTag} ✅ RPC ok: finalizado=${result.finalizado_id}, proximo=${result.proximo_id || "(encerrada)"}`)

    // Recarrega os confrontos finais do banco
    const confrontoFinalizado = await this.getConfrontoById(confrontoId)
    let proximoConfronto: Confronto | null = null
    if (result.proximo_id) {
      proximoConfronto = await this.getConfrontoById(result.proximo_id)
    }

    return {
      confrontoFinalizado: confrontoFinalizado as Confronto,
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
   * Parseia o campo times do histórico, que pode vir como:
   * - Array (formato correto após correção)
   * - String (registros antigos com double JSON.stringify)
   */
  private parseTimes(times: unknown): { nome: string; jogadores: TimeSorteioJogador[] }[] {
    if (Array.isArray(times)) return times as { nome: string; jogadores: TimeSorteioJogador[] }[]
    if (typeof times === "string") {
      try {
        const parsed = JSON.parse(times)
        if (Array.isArray(parsed)) return parsed as { nome: string; jogadores: TimeSorteioJogador[] }[]
        console.warn("[CONFRONTO] parseTimes: parsed value is not array, retornando []")
        return []
      } catch {
        console.error("[CONFRONTO] parseTimes: erro ao parsear string JSON, retornando []")
        return []
      }
    }
    console.warn("[CONFRONTO] parseTimes: tipo inesperado, retornando []")
    return []
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
  /**
   * Parseia a fila restante de um confronto.
   * Agora fila_restante é armazenada como jsonb (array), mas registros
   * antigos podem ter string (double JSON.stringify).
   */
  private parseFila(confronto: Confronto): { nome: string; jogadores: TimeSorteioJogador[] }[] {
    const raw = confronto.fila_restante
    if (!raw) return []

    // Se já é array (jsonb retorna direto como JS array)
    if (Array.isArray(raw)) return raw as { nome: string; jogadores: TimeSorteioJogador[] }[]

    // Se é string (registros antigos com double JSON.stringify)
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed as { nome: string; jogadores: TimeSorteioJogador[] }[]
        return []
      } catch {
        return []
      }
    }

    return []
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

  // ==========================================
  // CRONÔMETRO AO VIVO (contagem progressiva)
  // ==========================================
  //
  // Lógica:
  //   tempo_exibido = tempo_acumulado + (now() - tempo_inicio)  [se rodando]
  //   tempo_exibido = tempo_acumulado                           [se pausado/parado]
  //
  // O banco é a fonte da verdade. O frontend apenas calcula
  // o delta local para exibição em tempo real.
  // ==========================================

  /**
   * Inicia ou resume o cronômetro.
   * - Se status = 'parado': define tempo_inicio = now(), status = 'rodando'
   * - Se status = 'pausado': define novo tempo_inicio = now(), status = 'rodando'
   *   (tempo_acumulado mantém o valor acumulado anterior)
   */
  async iniciarCronometro(confrontoId: string): Promise<Confronto | null> {
    const logTag = "[CRONOMETRO]"
    console.log(`${logTag} iniciar: confrontoId=${confrontoId}`)

    await this.verificarAdminPermissao(confrontoId)

    const { data } = await this.supabase
      .from("confrontos")
      .update({
        tempo_inicio: new Date().toISOString(),
        cronometro_status: "rodando",
      })
      .eq("id", confrontoId)
      .select()
      .single()

    if (!data) throw new Error("Erro ao iniciar cronômetro")
    console.log(`${logTag} ✅ Cronômetro rodando`)
    return data as Confronto | null
  }

  /**
   * Pausa o cronômetro: calcula o tempo decorrido desde tempo_inicio,
   * soma ao tempo_acumulado, salva e marca como pausado.
   */
  async pausarCronometro(confrontoId: string): Promise<Confronto | null> {
    const logTag = "[CRONOMETRO]"
    console.log(`${logTag} pausar: confrontoId=${confrontoId}`)

    await this.verificarAdminPermissao(confrontoId)

    const confronto = await this.getConfrontoById(confrontoId)
    if (!confronto) throw new Error("Confronto não encontrado")
    if (confronto.cronometro_status !== "rodando") {
      throw new Error("Cronômetro não está rodando")
    }

    // Calcula tempo decorrido desde o último início
    const inicioMs = new Date(confronto.tempo_inicio!).getTime()
    const decorrido = Math.floor((Date.now() - inicioMs) / 1000)
    const novoAcumulado = (confronto.tempo_acumulado || 0) + decorrido

    console.log(`${logTag} decorrido=${decorrido}s, acumulado=${novoAcumulado}s`)

    const { data } = await this.supabase
      .from("confrontos")
      .update({
        tempo_inicio: null,
        tempo_pausado_em: new Date().toISOString(),
        tempo_acumulado: novoAcumulado,
        cronometro_status: "pausado",
      })
      .eq("id", confrontoId)
      .select()
      .single()

    if (!data) throw new Error("Erro ao pausar cronômetro")
    console.log(`${logTag} ✅ Cronômetro pausado em ${novoAcumulado}s`)
    return data as Confronto | null
  }

  /**
   * Reseta o cronômetro: zera tempo_inicio, tempo_acumulado e volta para 'parado'.
   */
  async resetarCronometro(confrontoId: string): Promise<Confronto | null> {
    const logTag = "[CRONOMETRO]"
    console.log(`${logTag} resetar: confrontoId=${confrontoId}`)

    await this.verificarAdminPermissao(confrontoId)

    const { data } = await this.supabase
      .from("confrontos")
      .update({
        tempo_inicio: null,
        tempo_pausado_em: null,
        tempo_acumulado: 0,
        cronometro_status: "parado",
      })
      .eq("id", confrontoId)
      .select()
      .single()

    if (!data) throw new Error("Erro ao resetar cronômetro")
    console.log(`${logTag} ✅ Cronômetro resetado`)
    return data as Confronto | null
  }

  /**
   * Retorna o tempo decorrido em segundos para exibição.
   * Esta função é chamada no FRONTEND para calcular o tempo atual.
   *
   * Regra:
   *   status rodando => tempo_acumulado + (Date.now() - tempo_inicio)
   *   status pausado => tempo_acumulado
   *   status parado  => 0
   */
  static calcularTempoDecorrido(confronto: Confronto): number {
    const acumulado = confronto.tempo_acumulado || 0

    if (confronto.cronometro_status === "rodando" && confronto.tempo_inicio) {
      const inicioMs = new Date(confronto.tempo_inicio).getTime()
      const decorrido = Math.floor((Date.now() - inicioMs) / 1000)
      return Math.max(0, acumulado + decorrido)
    }

    if (confronto.cronometro_status === "pausado") {
      return Math.max(0, acumulado)
    }

    return 0
  }

  // ==========================================
  // LIMPAR ESTADO (para refazer sorteio)
  // ==========================================

  /**
   * Limpa todos os confrontos e eventos de uma pelada,
   * garantindo estado limpo antes de refazer o sorteio.
   * Usa RPC transactional no banco.
   */
  async limparEstadoConfrontos(peladaId: string, ocorrenciaId?: string): Promise<{ removidoEventos: number; removidoConfrontos: number }> {
    const logTag = "[LIMPAR-ESTADO]"
    console.log(`${logTag} peladaId=${peladaId}, ocorrenciaId=${ocorrenciaId}`)

    const { data, error } = await this.supabase.rpc("limpar_estado_confrontos", {
      p_pelada_id: peladaId,
      p_ocorrencia_id: ocorrenciaId || null,
    })

    if (error) {
      console.error(`${logTag} Erro:`, error)
      throw new Error(`Erro ao limpar estado: ${error.message}`)
    }

    const result = data as { removido_eventos?: number; removido_confrontos?: number; error?: string }
    if (result.error) throw new Error(result.error)

    console.log(`${logTag} ✅ ${result.removido_confrontos} confrontos e ${result.removido_eventos} eventos removidos`)

    return {
      removidoEventos: result.removido_eventos || 0,
      removidoConfrontos: result.removido_confrontos || 0,
    }
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
