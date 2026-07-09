"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { ConfrontoService } from "@/services/confronto-service"
import { PeladaService } from "@/services/pelada-service"
import {
  Loader2,
  ArrowLeft,
  Trophy,
  Swords,
  Target,
  Users,
  History,
  Zap,
  Play,
  CheckCircle2,
  MinusCircle,
  Goal,
  Star,
} from "lucide-react"
import type { Pelada, Confronto, EventoConfronto, TimeSorteioJogador } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

export default function AoVivoPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const confrontoService = new ConfrontoService(supabase)
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [peladaId, setPeladaId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [confrontoAtual, setConfrontoAtual] = useState<Confronto | null>(null)
  const [eventos, setEventos] = useState<EventoConfronto[]>([])
  const [historico, setHistorico] = useState<Confronto[]>([])
  const [isIniciando, setIsIniciando] = useState(false)
  const [isFinalizando, setIsFinalizando] = useState(false)
  const [animatingGoal, setAnimatingGoal] = useState<"a" | "b" | null>(null)
  const [showGolSelector, setShowGolSelector] = useState<"a" | "b" | null>(null)

  const isAdmin = user?.id === pelada?.admin_id

  useEffect(() => {
    params.then((p) => setPeladaId(p.id))
  }, [params])

  useEffect(() => {
    if (!peladaId || !user) return
    loadData()
  }, [peladaId, user])

  // Supabase Realtime: subscribe to confrontos and eventos changes
  useEffect(() => {
    if (!peladaId) return

    // Subscribe to confrontos updates (placar, status, novos confrontos)
    const confrontosChannel = supabase
      .channel(`confrontos-${peladaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "confrontos",
          filter: `pelada_id=eq.${peladaId}`,
        },
        async () => {
          // Recarrega confronto atual e histórico quando houver mudanças
          const atual = await confrontoService.getConfrontoAtual(peladaId)
          setConfrontoAtual(atual)
          if (atual) {
            const evts = await confrontoService.getEventos(atual.id)
            setEventos(evts)
          }
          const hist = await confrontoService.getHistoricoConfrontos(peladaId)
          setHistorico(hist)
        },
      )
      .subscribe()

    // Subscribe to eventos inserts (gols, assistências)
    const eventosChannel = supabase
      .channel(`eventos-${peladaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "eventos_confronto",
        },
        async (payload) => {
          const evento = payload.new as EventoConfronto
          // Verifica se o evento pertence ao confronto atual
          if (confrontoAtual && evento.confronto_id === confrontoAtual.id) {
            // Busca o profile do jogador
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", evento.jogador_id)
              .single()

            setEventos((prev) => [
              ...prev,
              { ...evento, profile: profile || undefined } as EventoConfronto,
            ])

            // Animação de gol
            if (evento.tipo === "gol") {
              setAnimatingGoal(evento.time_id as "a" | "b")
              setTimeout(() => setAnimatingGoal(null), 600)
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(confrontosChannel)
      supabase.removeChannel(eventosChannel)
    }
  }, [peladaId, confrontoAtual?.id])

  const loadData = async () => {
    const p = await peladaService.getById(peladaId)
    if (p) {
      setPelada(p)
      const atual = await confrontoService.getConfrontoAtual(peladaId)
      setConfrontoAtual(atual)
      if (atual) {
        const evts = await confrontoService.getEventos(atual.id)
        setEventos(evts)
      }
      const hist = await confrontoService.getHistoricoConfrontos(peladaId)
      setHistorico(hist)
    }
    setLoading(false)
  }

  const refreshConfronto = useCallback(async () => {
    if (!peladaId) return
    const atual = await confrontoService.getConfrontoAtual(peladaId)
    setConfrontoAtual(atual)
    if (atual) {
      const evts = await confrontoService.getEventos(atual.id)
      setEventos(evts)
    }
    const hist = await confrontoService.getHistoricoConfrontos(peladaId)
    setHistorico(hist)
  }, [peladaId])

  const handleIniciar = async () => {
    if (!pelada || !isAdmin) return
    setIsIniciando(true)
    try {
      // Busca o último sorteio
      const sorteios = await peladaService.getHistoricoSorteios(peladaId)
      if (sorteios.length === 0) {
        toast({
          title: "Nenhum sorteio encontrado",
          description: "Realize um sorteio antes de iniciar os confrontos.",
          variant: "destructive",
        })
        return
      }
      const ultimoSorteio = sorteios[0]
      const confronto = await confrontoService.iniciarConfrontos(peladaId, ultimoSorteio.id)
      if (confronto) {
        setConfrontoAtual(confronto)
        toast({ title: "Confrontos iniciados! 🎮", variant: "success" })
      }
    } catch (error) {
      toast({
        title: "Erro ao iniciar confrontos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setIsIniciando(false)
    }
  }

  const handleMarcarGol = async (jogadorId: string, timeId: "a" | "b") => {
    if (!confrontoAtual || !isAdmin) return
    try {
      setAnimatingGoal(timeId)
      await confrontoService.marcarGol(confrontoAtual.id, jogadorId, timeId)
      // Aguarda animação
      await new Promise((r) => setTimeout(r, 600))
      await refreshConfronto()
      setShowGolSelector(null)
    } catch (error) {
      toast({
        title: "Erro ao marcar gol",
        variant: "destructive",
      })
    } finally {
      setAnimatingGoal(null)
    }
  }

  const handleMarcarAssistencia = async (jogadorId: string, timeId: "a" | "b") => {
    if (!confrontoAtual || !isAdmin) return
    try {
      await confrontoService.marcarAssistencia(confrontoAtual.id, jogadorId, timeId)
      toast({ title: "Assistência registrada! 🎯", variant: "success" })
      await refreshConfronto()
    } catch (error) {
      toast({
        title: "Erro ao marcar assistência",
        variant: "destructive",
      })
    }
  }

  const handleFinalizar = async (resultado: "time_a" | "time_b" | "empate") => {
    if (!confrontoAtual || !isAdmin) return
    setIsFinalizando(true)
    try {
      const { proximoConfronto } = await confrontoService.finalizarConfronto(
        confrontoAtual.id,
        resultado,
      )
      toast({ title: "Confronto finalizado! 🏆", variant: "success" })

      if (proximoConfronto) {
        setConfrontoAtual(proximoConfronto)
        const evts = await confrontoService.getEventos(proximoConfronto.id)
        setEventos(evts)
      } else {
        setConfrontoAtual(null)
        setEventos([])
      }
      const hist = await confrontoService.getHistoricoConfrontos(peladaId)
      setHistorico(hist)
    } catch (error) {
      toast({
        title: "Erro ao finalizar confronto",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setIsFinalizando(false)
    }
  }

  const getJogadoresTime = (jogadores: unknown): TimeSorteioJogador[] => {
    if (Array.isArray(jogadores)) return jogadores as TimeSorteioJogador[]
    try {
      return JSON.parse(jogadores as string) as TimeSorteioJogador[]
    } catch {
      return []
    }
  }

  const getEventosTime = (timeId: "a" | "b") => {
    return eventos.filter((e) => e.time_id === timeId)
  }

  const getGols = (timeId: "a" | "b") => {
    return getEventosTime(timeId).filter((e) => e.tipo === "gol")
  }

  const getAssistencias = (timeId: "a" | "b") => {
    return getEventosTime(timeId).filter((e) => e.tipo === "assistencia")
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!pelada) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="text-5xl mb-4">😕</div>
            <CardTitle>Pelada não encontrada</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button variant="gradient">Voltar ao Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[68px] items-center justify-between md:min-h-[76px]">
            <div className="flex items-center gap-3">
              <Link href={`/pelada/${peladaId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Logo />
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !confrontoAtual && (
                <Button
                  variant="glow"
                  size="sm"
                  onClick={handleIniciar}
                  disabled={isIniciando}
                >
                  {isIniciando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Iniciar Confrontos
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Title */}
          <FadeIn>
            <div className="text-center mb-8">
              <motion.div
                animate={
                  confrontoAtual
                    ? { scale: [1, 1.05, 1] }
                    : {}
                }
                transition={{ duration: 2, repeat: Infinity }}
                className="text-5xl mb-4 inline-block"
              >
                {confrontoAtual ? "⚔️" : "🎮"}
              </motion.div>
              <h1 className="text-3xl font-bold mb-2">
                Confrontos ao Vivo
              </h1>
              <p className="text-muted-foreground">
                {pelada.nome}
                {!isAdmin && " — Modo espectador"}
              </p>
            </div>
          </FadeIn>

          {/* No confronto yet */}
          {!confrontoAtual && historico.length === 0 && (
            <FadeIn>
              <Card className="text-center py-16">
                <CardContent>
                  <motion.div
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <Swords className="h-20 w-20 text-muted-foreground/30 mx-auto mb-4" />
                  </motion.div>
                  <h2 className="text-xl font-semibold mb-2">
                    Nenhum confronto ativo
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    {isAdmin
                      ? "Clique em \"Iniciar Confrontos\" no header para começar. Certifique-se de ter realizado um sorteio antes."
                      : "O administrador irá iniciar os confrontos em breve."}
                  </p>
                  {!isAdmin && (
                    <Link href={`/pelada/${peladaId}`}>
                      <Button variant="outline">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {/* No confronto but has history */}
          {!confrontoAtual && historico.length > 0 && (
            <FadeIn>
              <Card className="text-center py-12 mb-8">
                <CardContent>
                  <Trophy className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">
                    Todos os confrontos foram finalizados! 🏆
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {isAdmin
                      ? "Clique em \"Iniciar Confrontos\" para uma nova rodada."
                      : "Aguardando nova rodada de confrontos."}
                  </p>
                  {isAdmin && (
                    <Button
                      variant="glow"
                      onClick={handleIniciar}
                      disabled={isIniciando}
                    >
                      {isIniciando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Nova Rodada
                    </Button>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {/* Confronto Atual */}
            {confrontoAtual && (
            <FadeIn>
              {/* Scoreboard */}
              <div className="relative mb-8">
                {/* Goal Animation Overlay */}
                <AnimatePresence>
                  {animatingGoal && (
                    <motion.div
                      initial={{ scale: 0, opacity: 1 }}
                      animate={{ scale: 3, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6 }}
                      className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
                    >
                      <Goal className="h-16 w-16 text-[#00e676]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#121212] border border-[#2a2a2a] overflow-hidden">
                  {/* Teams vs Score */}
                  <div className="flex flex-col md:flex-row items-stretch">
                    {/* Time A */}
                    <div className="flex-1 p-6 md:p-8 text-center md:text-left">
                      <h2 className="text-lg md:text-xl font-bold text-[#fafafa] mb-1">
                        {confrontoAtual.time_a_nome}
                      </h2>
                      <p className="text-xs text-muted-foreground mb-4">
                        {getJogadoresTime(confrontoAtual.time_a_jogadores).length} jogadores
                      </p>

                      {/* Jogadores Time A */}
                      <div className="hidden md:flex flex-wrap gap-2 justify-center md:justify-start">
                        {getJogadoresTime(confrontoAtual.time_a_jogadores).map((j) => (
                          <div
                            key={j.user_id}
                            className="flex items-center gap-1.5 bg-[#121212] rounded-lg px-2.5 py-1.5 border border-[#2a2a2a] text-xs"
                          >
                            {j.avatar_url ? (
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={j.avatar_url} />
                              </Avatar>
                            ) : (
                              <AvatarPlaceholder name={j.nome} size="sm" />
                            )}
                            <span className="text-[#fafafa]">{j.nome}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-center justify-center gap-6 md:gap-10 px-8 py-6 border-t md:border-t-0 md:border-x border-[#2a2a2a]">
                      <motion.span
                        key={`a-${confrontoAtual.placar_a}`}
                        initial={animatingGoal === "a" ? { scale: 1.5 } : undefined}
                        animate={{ scale: 1 }}
                        className={`text-6xl md:text-7xl font-black ${
                          confrontoAtual.placar_a > confrontoAtual.placar_b
                            ? "text-[#00e676]"
                            : confrontoAtual.placar_a < confrontoAtual.placar_b
                            ? "text-muted-foreground"
                            : "text-[#fafafa]"
                        }`}
                      >
                        {confrontoAtual.placar_a}
                      </motion.span>
                      <span className="text-3xl font-bold text-muted-foreground">×</span>
                      <motion.span
                        key={`b-${confrontoAtual.placar_b}`}
                        initial={animatingGoal === "b" ? { scale: 1.5 } : undefined}
                        animate={{ scale: 1 }}
                        className={`text-6xl md:text-7xl font-black ${
                          confrontoAtual.placar_b > confrontoAtual.placar_a
                            ? "text-[#00e676]"
                            : confrontoAtual.placar_b < confrontoAtual.placar_a
                            ? "text-muted-foreground"
                            : "text-[#fafafa]"
                        }`}
                      >
                        {confrontoAtual.placar_b}
                      </motion.span>
                    </div>

                    {/* Time B */}
                    <div className="flex-1 p-6 md:p-8 text-center md:text-right">
                      <h2 className="text-lg md:text-xl font-bold text-[#fafafa] mb-1">
                        {confrontoAtual.time_b_nome}
                      </h2>
                      <p className="text-xs text-muted-foreground mb-4">
                        {getJogadoresTime(confrontoAtual.time_b_jogadores).length} jogadores
                      </p>

                      {/* Jogadores Time B */}
                      <div className="hidden md:flex flex-wrap gap-2 justify-center md:justify-end">
                        {getJogadoresTime(confrontoAtual.time_b_jogadores).map((j) => (
                          <div
                            key={j.user_id}
                            className="flex items-center gap-1.5 bg-[#121212] rounded-lg px-2.5 py-1.5 border border-[#2a2a2a] text-xs"
                          >
                            {j.avatar_url ? (
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={j.avatar_url} />
                              </Avatar>
                            ) : (
                              <AvatarPlaceholder name={j.nome} size="sm" />
                            )}
                            <span className="text-[#fafafa]">{j.nome}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Jogadores Mobile */}
                  <div className="md:hidden border-t border-[#2a2a2a] p-4 space-y-4">
                    {/* Time A jogadores mobile */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{confrontoAtual.time_a_nome}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {getJogadoresTime(confrontoAtual.time_a_jogadores).map((j) => (
                          <span key={j.user_id} className="text-xs bg-[#121212] px-2 py-1 rounded-md border border-[#2a2a2a]">
                            {j.nome}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Time B jogadores mobile */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{confrontoAtual.time_b_nome}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {getJogadoresTime(confrontoAtual.time_b_jogadores).map((j) => (
                          <span key={j.user_id} className="text-xs bg-[#121212] px-2 py-1 rounded-md border border-[#2a2a2a]">
                            {j.nome}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Admin Controls */}
                  {isAdmin && (
                    <div className="border-t border-[#2a2a2a] p-4 space-y-4">
                      {/* Goal Buttons */}
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="glow"
                          size="lg"
                          className="text-base h-14"
                          onClick={() => setShowGolSelector(showGolSelector === "a" ? null : "a")}
                        >
                          <Goal className="h-5 w-5" />
                          Gol {confrontoAtual.time_a_nome}
                        </Button>
                        <Button
                          variant="glow"
                          size="lg"
                          className="text-base h-14"
                          onClick={() => setShowGolSelector(showGolSelector === "b" ? null : "b")}
                        >
                          <Goal className="h-5 w-5" />
                          Gol {confrontoAtual.time_b_nome}
                        </Button>
                      </div>

                      {/* Gol Player Selector */}
                      <AnimatePresence>
                        {showGolSelector && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                              <p className="text-sm font-medium text-muted-foreground mb-3">
                                Quem marcou o gol?
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {getJogadoresTime(
                                  showGolSelector === "a"
                                    ? confrontoAtual.time_a_jogadores
                                    : confrontoAtual.time_b_jogadores,
                                ).map((j) => (
                                  <div key={j.user_id} className="flex flex-col gap-1">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="text-xs h-auto py-2"
                                      onClick={() => handleMarcarGol(j.user_id, showGolSelector)}
                                    >
                                      <Target className="h-3 w-3 mr-1" />
                                      Gol: {j.nome}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-xs h-auto py-1 text-muted-foreground hover:text-[#fafafa]"
                                      onClick={() => handleMarcarAssistencia(j.user_id, showGolSelector)}
                                    >
                                      <Star className="h-3 w-3 mr-1" />
                                      Assist: {j.nome}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Finalizar Buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-[#00e676] text-[#0a0a0a]"
                          onClick={() => handleFinalizar("time_a")}
                          disabled={isFinalizando}
                        >
                          <Trophy className="h-4 w-4 mr-1" />
                          {confrontoAtual.time_a_nome}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFinalizar("empate")}
                          disabled={isFinalizando}
                        >
                          <MinusCircle className="h-4 w-4 mr-1" />
                          Empate
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-[#00e676] text-[#0a0a0a]"
                          onClick={() => handleFinalizar("time_b")}
                          disabled={isFinalizando}
                        >
                          <Trophy className="h-4 w-4 mr-1" />
                          {confrontoAtual.time_b_nome}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Eventos ao Vivo */}
              {eventos.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                    <Zap className="h-5 w-5 text-[#00e676]" />
                    Eventos do Confronto
                  </h3>
                  <div className="space-y-2">
                    {eventos.map((evento) => (
                      <motion.div
                        key={evento.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]"
                      >
                        {evento.tipo === "gol" ? (
                          <Goal className="h-4 w-4 text-[#00e676] shrink-0" />
                        ) : (
                          <Star className="h-4 w-4 text-yellow-500 shrink-0" />
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {evento.profile?.avatar_url ? (
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={evento.profile.avatar_url} />
                            </Avatar>
                          ) : (
                            <AvatarPlaceholder name={evento.profile?.nome} size="sm" />
                          )}
                          <span className="text-sm text-[#fafafa] truncate">
                            {evento.profile?.nome || "Jogador"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {evento.tipo === "gol" ? "⚽ GOL" : "🎯 Assist"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {evento.time_id === "a" ? confrontoAtual?.time_a_nome : confrontoAtual?.time_b_nome}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </FadeIn>
          )}

          {/* Histórico */}
          {historico.length > 0 && (
            <FadeIn>
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <History className="h-5 w-5 text-muted-foreground" />
                  Histórico de Confrontos
                </h3>
                <div className="space-y-2">
                  {historico.map((conf, i) => (
                    <motion.div
                      key={conf.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-xs text-muted-foreground w-6">
                          {conf.ordem}º
                        </span>
                        <div className="flex items-center gap-2 flex-1">
                          <span className={`text-sm font-medium ${
                            conf.resultado === "time_a" ? "text-[#00e676]" : "text-[#fafafa]"
                          }`}>
                            {conf.time_a_nome}
                          </span>
                          <span className="text-lg font-bold text-[#fafafa]">
                            {conf.placar_a}
                          </span>
                          <span className="text-xs text-muted-foreground">×</span>
                          <span className="text-lg font-bold text-[#fafafa]">
                            {conf.placar_b}
                          </span>
                          <span className={`text-sm font-medium ${
                            conf.resultado === "time_b" ? "text-[#00e676]" : "text-[#fafafa]"
                          }`}>
                            {conf.time_b_nome}
                          </span>
                        </div>
                      </div>
                      <div>
                        {conf.resultado === "empate" ? (
                          <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full">
                            Empate
                          </span>
                        ) : (
                          <span className="text-xs bg-[#00e676]/10 text-[#00e676] px-2 py-1 rounded-full">
                            {conf.resultado === "time_a" ? conf.time_a_nome : conf.time_b_nome} venceu
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </FadeIn>
          )}
        </PageTransition>
      </main>
    </div>
  )
}
