// ==========================================
// Tipos do Sistema PeladaPro
// ==========================================

export type PlayerType = "mensalista" | "diarista"

export type ConfirmacaoStatus = "pendente" | "confirmado" | "recusado"

export type SorteioModo = "ordem_chegada"

/** Apenas campos editáveis do perfil pelo usuário */
export interface ProfileUpdate {
  nome?: string
  avatar_url?: string | null
  numero_favorito?: number | null
  posicoes?: string[]
}

export interface Profile {
  id: string
  email: string
  nome: string
  avatar_url: string | null
  numero_favorito: number | null
  posicoes: string[]
  tipo: PlayerType
  role: "user" | "admin"
  created_at: string
}

export interface Pelada {
  id: string
  nome: string
  descricao: string | null
  admin_id: string
  limite_por_ocorrencia: number
  numero_times: number
  jogadores_por_time: number
  local: string | null
  data: string | null
  recorrente: boolean
  dia_semana: number | null
  horario: string | null
  created_at: string
}

export interface PeladaOcorrencia {
  id: string
  pelada_id: string
  data: string
  status: "aberta" | "encerrada"
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
  hora_chegada: string | null
  pelada_ocorrencia_id?: string | null
  created_at: string
  profile?: Profile
}

export interface ListaEspera {
  id: string
  pelada_id: string
  user_id: string
  data_jogo: string
  posicao: number
  pelada_ocorrencia_id?: string | null
  created_at: string
  profile?: Profile
}

export interface HistoricoSorteio {
  id: string
  pelada_id: string
  data_sorteio: string
  modo: SorteioModo
  times: TimeSorteio[]
  pelada_ocorrencia_id?: string | null
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
  /** jsonb: array de times (registros novos) ou string (registros antigos). Usar parseFila() para ler. */
  fila_restante?: unknown
  tempo_limite: number
  iniciado_em: string | null
  tempo_restante: number | null
  tempo_inicio: string | null
  tempo_pausado_em: string | null
  tempo_acumulado: number
  cronometro_status: "parado" | "rodando" | "pausado"
  ordem: number
  pelada_ocorrencia_id?: string | null
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


