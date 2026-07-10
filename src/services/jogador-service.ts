import type { SupabaseClient } from "@supabase/supabase-js"
import type { Pelada, Profile } from "@/types"

export interface JogadorStats {
  totalJogos: number
  confirmados: number
  percentualPresenca: number
  streak: number
}

export class JogadorService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Busca perfil público do jogador
   */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    return data as Profile | null
  }

  /**
   * Calcula estatísticas de presença do jogador
   */
  async getStats(userId: string): Promise<JogadorStats> {
    // Busca todas as confirmações do jogador
    const { data: confirmacoes } = await this.supabase
      .from("confirmacoes_dia")
      .select("status")
      .eq("user_id", userId)

    const rows = (confirmacoes || []) as { status: string }[]
    const totalJogos = rows.length
    const confirmados = rows.filter((r) => r.status === "confirmado").length
    const percentualPresenca = totalJogos > 0 ? Math.round((confirmados / totalJogos) * 100) : 0

    // Calcula streak: presenças consecutivas da data mais recente para trás
    const { data: datas } = await this.supabase
      .from("confirmacoes_dia")
      .select("data_jogo, status")
      .eq("user_id", userId)
      .eq("status", "confirmado")
      .order("data_jogo", { ascending: false })

    const datasArr = (datas || []) as { data_jogo: string; status: string }[]

    let streak = 0
    if (datasArr.length > 0) {
      // Agrupa por data e ordena decrescente
      const datasUnicas = [...new Set(datasArr.map((d) => d.data_jogo))].sort().reverse()

      // Verifica sequência
      const hoje = new Date()
      let dataEsperada = datasUnicas.length > 0 ? new Date(datasUnicas[0]) : null

      for (const dataStr of datasUnicas) {
        const data = new Date(dataStr)
        if (dataEsperada && Math.abs(data.getTime() - dataEsperada.getTime()) <= 8 * 24 * 60 * 60 * 1000) {
          streak++
          // Próxima data esperada: uma semana antes (peladas são semanais)
          dataEsperada = new Date(data.getTime() - 7 * 24 * 60 * 60 * 1000)
        } else {
          break
        }
      }
    }

    return {
      totalJogos,
      confirmados,
      percentualPresenca,
      streak,
    }
  }

  /**
   * Busca peladas que o jogador participa
   */
  async getPeladas(userId: string): Promise<Pelada[]> {
    // Busca IDs das peladas onde o user é participante
    const { data: participacoes } = await this.supabase
      .from("pelada_participantes")
      .select("pelada_id")
      .eq("user_id", userId)

    if (!participacoes?.length) return []

    const peladaIds = [...new Set(participacoes.map((p) => p.pelada_id))]

    // Usa RPC security definer para bypassar RLS
    const { data } = await this.supabase.rpc("buscar_por_ids", {
      p_pelada_ids: peladaIds,
    })

    return (data as Pelada[]) || []
  }
}
