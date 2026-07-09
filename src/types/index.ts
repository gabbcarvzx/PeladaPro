// ==========================================
// Tipos do Sistema PeladaPro
// ==========================================

export type PlayerType = "mensalista" | "diarista"

export type ConfirmacaoStatus = "pendente" | "confirmado" | "recusado"

export type SorteioModo = "aleatorio" | "ordem_chegada" | "priorizar_mensalistas" | "equilibrado"

/** Apenas campos editáveis do perfil pelo usuário */
export interface ProfileUpdate {
  nome?: string
  avatar_url?: string | null
  numero_favorito?: number | null
}

export interface Profile {
  id: string
  email: string
  nome: string
  avatar_url: string | null
  numero_favorito: number | null
  tipo: PlayerType
  created_at: string
}

export interface Pelada {
  id: string
  nome: string
  descricao: string | null
  link_convite: string
  admin_id: string
  limite_jogadores: number
  numero_times: number
  jogadores_por_time: number
  local: string | null
  data: string | null
  created_at: string
}

export interface PeladaParticipante {
  id: string
  pelada_id: string
  user_id: string
  tipo: PlayerType
  created_at: string
  profile?: Profile
}

export interface ConfirmacaoDia {
  id: string
  pelada_id: string
  user_id: string
  data_jogo: string
  status: ConfirmacaoStatus
  ordem_chegada: number | null
  created_at: string
  profile?: Profile
}

export interface ListaEspera {
  id: string
  pelada_id: string
  user_id: string
  data_jogo: string
  posicao: number
  prioridade: PlayerType
  created_at: string
  profile?: Profile
}

export interface HistoricoSorteio {
  id: string
  pelada_id: string
  data_sorteio: string
  modo: SorteioModo
  times: TimeSorteio[]
  created_at: string
}

export interface TimeSorteio {
  nome: string
  jogadores: {
    user_id: string
    nome: string
    avatar_url: string | null
  }[]
}

export interface Confronto {
  id: string
  pelada_id: string
  sorteio_id: string | null
  time_a_nome: string
  time_b_nome: string
  time_a_jogadores: TimeSorteioJogador[]
  time_b_jogadores: TimeSorteioJogador[]
  placar_a: number
  placar_b: number
  status: "em_andamento" | "finalizado"
  resultado: "time_a" | "time_b" | "empate" | null
  fila_restante?: string
  ordem: number
  created_at: string
  updated_at: string
}

export interface EventoConfronto {
  id: string
  confronto_id: string
  jogador_id: string
  tipo: "gol" | "assistencia"
  time_id: "a" | "b"
  created_at: string
  profile?: Profile
}

export type TimeSorteioJogador = {
  user_id: string
  nome: string
  avatar_url: string | null
}
