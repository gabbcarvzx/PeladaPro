export const APP_NAME = "PeladaPro"
export const APP_DESCRIPTION = "Sistema para organização de peladas de futebol"

export const PELADA_LIMITES = {
  MIN_JOGADORES: 4,
  MAX_JOGADORES: 50,
  MIN_TIMES: 2,
  MAX_TIMES: 8,
  MIN_JOGADORES_POR_TIME: 2,
  MAX_JOGADORES_POR_TIME: 11,
} as const

export const CORES_TIMES = [
  { nome: "Azul", bg: "bg-blue-500", text: "text-white" },
  { nome: "Vermelho", bg: "bg-red-500", text: "text-white" },
  { nome: "Verde", bg: "bg-green-500", text: "text-white" },
  { nome: "Amarelo", bg: "bg-yellow-400", text: "text-black" },
  { nome: "Roxo", bg: "bg-purple-500", text: "text-white" },
  { nome: "Laranja", bg: "bg-orange-500", text: "text-white" },
  { nome: "Rosa", bg: "bg-pink-500", text: "text-white" },
  { nome: "Cinza", bg: "bg-gray-500", text: "text-white" },
] as const

