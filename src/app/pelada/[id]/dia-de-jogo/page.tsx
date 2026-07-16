"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"

import { toast } from "@/components/ui/toaster"
import { PeladaService } from "@/services/pelada-service"
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Users,
  Clock,
  ListOrdered,
  UserX,
  UserMinus,
  LogOut,
  Trophy,
  Zap,
  RefreshCw,
} from "lucide-react"
import type { Pelada, PeladaOcorrencia, PeladaParticipante, ConfirmacaoDia, ListaEspera } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

type PlayerStatus = "sem_intencao" | "pendente" | "confirmado" | "recusado" | "fila"

interface PlayerRow {
  userId: string
  nome: string
  avatarUrl: string | null
  status: PlayerStatus
  ordemChegada: number | null
  horaChegada: string | null
  posicaoFila: number
}

export default function DiaDeJogoPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [peladaId, setPeladaId] = useState<string>("")
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [confirmadosList, setConfirmadosList] = useState<PlayerRow[]>([])
  const [filaList, setFilaList] = useState<PlayerRow[]>([])
  const [confirmadosCount, setConfirmadosCount] = useState(0)
  const [limite, setLimite] = useState(25)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [ocorrenciaAtual, setOcorrenciaAtual] = useState<PeladaOcorrencia | null>(null)
  const [dataJogo, setDataJogo] = useState("")
  const [encerrando, setEncerrando] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [agoText, setAgoText] = useState("")

  // Atualiza o texto "há X" a cada 10 segundos
  useEffect(() => {
    if (!lastUpdatedAt) return
    const update = () => {
      const diff = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000)
      if (diff < 5) setAgoText("agora")
      else if (diff < 60) setAgoText(`há ${diff}s`)
      else if (diff < 3600) setAgoText(`há ${Math.floor(diff / 60)}min`)
      else setAgoText(`há ${Math.floor(diff / 3600)}h`)
    }
    update()
    const interval = setInterval(update, 10000)
    return () => clearInterval(interval)
  }, [lastUpdatedAt])

  const isConfirming = useCallback((id: string) => confirmingId === id, [confirmingId])

  useEffect(() => {
    params.then((p) => setPeladaId(p.id))
  }, [params])

  useEffect(() => {
    if (!peladaId || !user) return
    loadAll()
  }, [peladaId, user])

  useEffect(() => {
    if (!authLoading && !adminChecked && !user) {
      router.push("/auth/login")
    }
  }, [user, authLoading, adminChecked, router])

  const loadAll = async () => {
    try {
      const p = await peladaService.getById(peladaId)
      if (!p) {
        toast({ title: "Pelada não encontrada", variant: "destructive" })
        router.push("/dashboard")
        return
      }

      setPelada(p)
      setLimite(p.limite_por_ocorrencia || 25)

      // Verifica se é admin
      if (user?.id !== p.admin_id) {
        setIsAdmin(false)
        setAdminChecked(true)
        return
      }

      setIsAdmin(true)
      setAdminChecked(true)

      // Define data do jogo
      let data = new Date().toISOString().split("T")[0]
      if (p.recorrente) {
        const oc = await peladaService.getOrCreateProximaOcorrencia(peladaId)
        if (oc) {
          setOcorrenciaAtual(oc)
          data = oc.data
        }
      }
      setDataJogo(data)

      // Carrega dados
      await loadPlayers(data, p.id)
    } catch (err) {
      console.error("[DIA-DE-JOGO] Erro ao carregar:", err)
      toast({ title: "Erro ao carregar dados", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const loadPlayers = async (data: string, pid: string) => {
    const [participantes, confirmacoes, fila] = await Promise.all([
      peladaService.getParticipantes(pid),
      peladaService.getConfirmacoes(pid, data),
      peladaService.getFilaEspera(pid, data),
    ])

    const confMap = new Map<string, ConfirmacaoDia>()
    for (const c of confirmacoes) {
      confMap.set(c.user_id, c)
    }

    const filaSet = new Set(fila.map((f) => f.user_id))
    const filaPosMap = new Map(fila.map((f) => [f.user_id, f.posicao]))

    const rows: PlayerRow[] = participantes
      .filter((p) => p.user_id !== pelada?.admin_id) // não mostra admin na lista
      .map((p) => {
        const conf = confMap.get(p.user_id)
        let status: PlayerStatus = "sem_intencao"
        if (conf) {
          if (conf.status === "confirmado") status = "confirmado"
          else if (conf.status === "recusado") status = "recusado"
          else if (conf.status === "pendente") status = "pendente"
        }
        if (filaSet.has(p.user_id)) status = "fila"

        return {
          userId: p.user_id,
          nome: p.profile?.nome || "Jogador",
          avatarUrl: p.profile?.avatar_url || null,
          status,
          ordemChegada: conf?.ordem_chegada || null,
          horaChegada: conf?.hora_chegada || null,
          posicaoFila: filaPosMap.get(p.user_id) || 0,
        }
      })

    setPlayers(rows)

    // Confirmados ordenados por ordem_chegada
    const confirmados = rows
      .filter((r) => r.status === "confirmado")
      .sort((a, b) => (a.ordemChegada || 999) - (b.ordemChegada || 999))
    setConfirmadosList(confirmados)
    setConfirmadosCount(confirmados.length)

    // Fila ordenada por posicao
    const filaSorted = rows
      .filter((r) => r.status === "fila")
      .sort((a, b) => a.posicaoFila - b.posicaoFila)
    setFilaList(filaSorted)
    setLastUpdatedAt(new Date())
  }

  const handleConfirmarChegada = async (userId: string) => {
    if (confirmingId) return // previne clique duplo
    setConfirmingId(userId)

    try {
      const result = await peladaService.confirmarChegada(
        peladaId,
        userId,
        dataJogo,
        ocorrenciaAtual?.id,
      )

      // Recarrega dados do servidor (fonte única da verdade)
      await loadPlayers(dataJogo, peladaId)
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao confirmar chegada",
        variant: "destructive",
      })
    } finally {
      setConfirmingId(null)
    }
  }

  const handleRecusar = async (userId: string) => {
    try {
      const result = await peladaService.recusarPresenca(
        peladaId,
        userId,
        dataJogo,
        ocorrenciaAtual?.id,
      )

      // Recarrega dados
      await loadPlayers(dataJogo, peladaId)

      if (result.promovido && result.nomePromovido) {
        toast({
          title: `${result.nomePromovido} foi promovido da fila!`,
          variant: "success",
        })
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao recusar",
        variant: "destructive",
      })
    }
  }

  const handleEncerrar = async () => {
    if (!ocorrenciaAtual) {
      toast({ title: "Nenhuma ocorrência ativa para encerrar", variant: "default" })
      return
    }

    setEncerrando(true)
    try {
      await peladaService.encerrarOcorrencia(ocorrenciaAtual.id)
      toast({ title: "Pelada encerrada! ✅", variant: "success" })
      setOcorrenciaAtual((prev) => (prev ? { ...prev, status: "encerrada" } : prev))
    } catch (err) {
      toast({
        title: "Erro ao encerrar",
        description: err instanceof Error ? err.message : "Erro",
        variant: "destructive",
      })
    } finally {
      setEncerrando(false)
    }
  }

  const statusIcon = (status: PlayerStatus) => {
    switch (status) {
      case "confirmado":
        return <CheckCircle2 className="h-6 w-6 text-[#00e676]" />
      case "pendente":
        return <Clock className="h-6 w-6 text-[#ffab00]" />
      case "recusado":
        return <UserX className="h-6 w-6 text-[#ff5252]" />
      case "fila":
        return <ListOrdered className="h-6 w-6 text-[#ffab00]" />
      default:
        return <UserMinus className="h-6 w-6 text-[#6b7280]" />
    }
  }

  const statusLabel = (status: PlayerStatus) => {
    switch (status) {
      case "confirmado": return "Chegou"
      case "pendente": return "Vai jogar"
      case "recusado": return "Não vem"
      case "fila": return "Na fila"
      default: return "Sem confirmação"
    }
  }

  const statusColor = (status: PlayerStatus) => {
    switch (status) {
      case "confirmado": return "border-l-[#00e676] bg-[#00e676]/5"
      case "pendente": return "border-l-[#ffab00] bg-[#ffab00]/5"
      case "recusado": return "border-l-[#ff5252] bg-[#ff5252]/5"
      case "fila": return "border-l-[#ffab00] bg-[#ffab00]/5"
      default: return "border-l-[#6b7280] bg-[#121212]"
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-10 w-10 animate-spin text-[#00e676]" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0a]">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-bold text-[#fafafa] mb-3">Acesso restrito</h1>
          <p className="text-[#6b7280] mb-6 text-lg">
            Apenas o administrador da pelada pode acessar o Modo Dia de Jogo.
          </p>
          <Link href={`/pelada/${peladaId}`}>
            <Button variant="glow" size="lg">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Voltar
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header compacto */}
      <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href={`/pelada/${peladaId}`}>
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <ArrowLeft className="h-6 w-6" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-bold text-[#fafafa] leading-tight">
                  {pelada?.nome}
                </h1>
                <p className="text-xs text-[#6b7280]">
                  {new Date(dataJogo + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Última atualização */}
              {lastUpdatedAt && (
                <div className="text-[10px] text-[#6b7280]/60 text-right leading-tight mr-1">
                  <span>{agoText}</span>
                </div>
              )}

              {/* Botão recarregar */}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => {
                  setRefreshing(true)
                  loadPlayers(dataJogo, peladaId).finally(() => setRefreshing(false))
                }}
                disabled={refreshing}
                title="Recarregar dados"
              >
                <RefreshCw className={`h-4 w-4 text-[#6b7280] hover:text-[#00e676] transition-all ${
                  refreshing ? "animate-spin" : ""
                }`} />
              </Button>

              {/* Contador de confirmados */}
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-[#00e676]">
                  {confirmadosCount}
                  <span className="text-base text-[#6b7280]">/{limite}</span>
                </p>
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">Confirmados</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {/* Barra de progresso */}
        <div className="w-full h-3 rounded-full bg-[#2a2a2a] overflow-hidden mb-6">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((confirmadosCount / limite) * 100, 100)}%` }}
            className={`h-full rounded-full transition-all duration-500 ${
              confirmadosCount >= limite ? "bg-[#ffab00]" : "bg-[#00e676]"
            }`}
          />
        </div>

        {/* Se a ocorrência estiver encerrada */}
        {ocorrenciaAtual?.status === "encerrada" && (
          <div className="text-center py-12">
            <Trophy className="h-16 w-16 text-[#ffab00] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#fafafa] mb-2">Pelada Encerrada</h2>
            <p className="text-[#6b7280] mb-6 text-lg">
              Os check-ins foram finalizados para esta data.
            </p>
            <Link href={`/pelada/${peladaId}/sorteio/${peladaId}`}>
              <Button variant="glow" size="lg">
                <Zap className="mr-2 h-5 w-5" />
                Ir para Sorteio
              </Button>
            </Link>
          </div>
        )}

        {(!ocorrenciaAtual || ocorrenciaAtual?.status !== "encerrada") && (
          <>
            {/* ========== SEÇÃO 1: TODOS OS JOGADORES ========== */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-[#6b7280] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Jogadores · {players.length}
              </h2>

              <div className="space-y-2">
                <AnimatePresence>
                  {players.map((player) => (
                    <motion.div
                      key={player.userId}
                      layout
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center gap-4 p-4 rounded-xl border border-[#2a2a2a] ${statusColor(player.status)} border-l-4 transition-all duration-200`}
                    >
                      {/* Avatar */}
                      <div className="shrink-0">
                        {player.avatarUrl ? (
                          <Avatar className="h-12 w-12 ring-2 ring-[#2a2a2a]">
                            <AvatarImage src={player.avatarUrl} />
                          </Avatar>
                        ) : (
                          <AvatarPlaceholder name={player.nome} size="lg" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-[#fafafa] truncate">
                          {player.nome}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {statusIcon(player.status)}
                          <span className="text-sm text-[#6b7280]">
                            {statusLabel(player.status)}
                          </span>
                          {player.ordemChegada && (
                            <span className="text-sm font-medium text-[#00e676] ml-2">
                              {player.ordemChegada}º
                            </span>
                          )}
                          {player.posicaoFila > 0 && (
                            <span className="text-sm font-medium text-[#ffab00] ml-2">
                              Fila: {player.posicaoFila}º
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="shrink-0">
                        {player.status === "confirmado" ? (
                          <span className="text-xs font-medium text-[#00e676] bg-[#00e676]/10 px-3 py-1.5 rounded-full">
                            ✓ Chegou
                          </span>
                        ) : player.status === "recusado" ? (
                          <span className="text-xs font-medium text-[#ff5252] bg-[#ff5252]/10 px-3 py-1.5 rounded-full">
                            Recusado
                          </span>
                        ) : player.status === "fila" ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[#ffab00] bg-[#ffab00]/10 px-3 py-1.5 rounded-full">
                              Espera
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0"
                              onClick={() => handleRecusar(player.userId)}
                              title="Remover da fila"
                            >
                              <UserX className="h-5 w-5 text-[#ff5252]" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="glow"
                            size="lg"
                            className="h-12 px-6 text-base font-bold"
                            onClick={() => handleConfirmarChegada(player.userId)}
                            disabled={isConfirming(player.userId)}
                          >
                            {isConfirming(player.userId) ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-5 w-5" />
                                Chegou
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {players.length === 0 && (
                  <div className="text-center py-12 text-[#6b7280]">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg">Nenhum jogador cadastrado</p>
                    <p className="text-sm">Adicione jogadores na página da pelada.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ========== SEÇÃO 2: CONFIRMADOS (Top 25) ========== */}
            {confirmadosList.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-[#00e676] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmados · {confirmadosCount}/{limite}
                </h2>

                <div className="rounded-xl border border-[#00e676]/20 bg-[#00e676]/[0.02] overflow-hidden">
                  {confirmadosList.map((player, index) => (
                    <div
                      key={player.userId}
                      className="flex items-center gap-4 px-5 py-4 border-b border-[#00e676]/10 last:border-0"
                    >
                      <span className={`text-lg font-bold w-10 text-center ${
                        index < 3 ? "text-[#00e676]" : "text-[#6b7280]"
                      }`}>
                        {player.ordemChegada}º
                      </span>
                      <div className="shrink-0">
                        {player.avatarUrl ? (
                          <Avatar className="h-10 w-10 ring-2 ring-[#00e676]/20">
                            <AvatarImage src={player.avatarUrl} />
                          </Avatar>
                        ) : (
                          <AvatarPlaceholder name={player.nome} size="md" />
                        )}
                      </div>
                      <span className="flex-1 text-base font-medium text-[#fafafa]">
                        {player.nome}
                      </span>
                      {player.horaChegada && (
                        <span className="text-xs text-[#00e676]/60 tabular-nums">
                          {new Date(player.horaChegada).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3 text-xs text-[#ff5252] hover:text-[#ff5252] hover:bg-[#ff5252]/10"
                        onClick={() => handleRecusar(player.userId)}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Recusar
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ========== SEÇÃO 3: LISTA DE ESPERA ========== */}
            {filaList.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-[#ffab00] uppercase tracking-wider mb-4 flex items-center gap-2">
                  <ListOrdered className="h-4 w-4" />
                  Lista de Espera · {filaList.length}
                </h2>

                <div className="rounded-xl border border-[#ffab00]/20 bg-[#ffab00]/[0.02] overflow-hidden">
                  {filaList.map((player) => (
                    <div
                      key={player.userId}
                      className="flex items-center gap-4 px-5 py-4 border-b border-[#ffab00]/10 last:border-0"
                    >
                      <span className="text-lg font-bold text-[#ffab00] w-10 text-center">
                        {player.posicaoFila}
                      </span>
                      <div className="shrink-0">
                        {player.avatarUrl ? (
                          <Avatar className="h-10 w-10 ring-2 ring-[#ffab00]/20">
                            <AvatarImage src={player.avatarUrl} />
                          </Avatar>
                        ) : (
                          <AvatarPlaceholder name={player.nome} size="md" />
                        )}
                      </div>
                      <span className="flex-1 text-base font-medium text-[#fafafa]">
                        {player.nome}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3 text-xs text-[#ff5252] hover:text-[#ff5252] hover:bg-[#ff5252]/10"
                        onClick={() => handleRecusar(player.userId)}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Botão flutuante "Encerrar Pelada" */}
      {ocorrenciaAtual && ocorrenciaAtual.status !== "encerrada" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent">
          <div className="max-w-3xl mx-auto flex gap-3">
            <Link href={`/pelada/${peladaId}/sorteio/${peladaId}`} className="flex-1">
              <Button variant="glow" size="lg" className="w-full h-14 text-base font-bold">
                <Zap className="mr-2 h-5 w-5" />
                Ir para Sorteio
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-6 text-base border-[#ff5252]/30 text-[#ff5252] hover:bg-[#ff5252]/10"
              onClick={handleEncerrar}
              disabled={encerrando}
            >
              {encerrando ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
