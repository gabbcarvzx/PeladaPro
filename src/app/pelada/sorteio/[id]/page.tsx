"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { PeladaService } from "@/services/pelada-service"
import { CORES_TIMES } from "@/utils/constants"
import {
  Loader2,
  Shuffle,
  ArrowLeft,
  RefreshCw,
  Trophy,
  Users,
  CheckCircle2,
  History,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import type { Pelada, PeladaParticipante, ConfirmacaoDia, HistoricoSorteio, SorteioModo } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

export default function SorteioPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [peladaId, setPeladaId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [sorteando, setSorteando] = useState(false)
  const [modo, setModo] = useState<SorteioModo>("aleatorio")
  const [selectedDate, setSelectedDate] = useState("")
  const [confirmados, setConfirmados] = useState<ConfirmacaoDia[]>([])
  const [timesGerados, setTimesGerados] = useState<HistoricoSorteio["times"]>([])
  const [historico, setHistorico] = useState<HistoricoSorteio[]>([])
  const [showResult, setShowResult] = useState(false)
  const [animating, setAnimating] = useState(false)

  const isAdmin = user?.id === pelada?.admin_id

  useEffect(() => {
    params.then((p) => setPeladaId(p.id))
  }, [params])

  useEffect(() => {
    if (!peladaId || !user) return
    loadData()
  }, [peladaId, user])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login")
    }
  }, [user, authLoading, router])

  const loadData = async () => {
    const p = await peladaService.getById(peladaId)
    if (p) {
      setPelada(p)
      const h = await peladaService.getHistoricoSorteios(peladaId)
      setHistorico(h)
    }
    setLoading(false)
  }

  const loadConfirmados = async () => {
    if (!selectedDate) return
    const confs = await peladaService.getConfirmacoes(peladaId, selectedDate)
    setConfirmados(confs.filter((c) => c.status === "confirmado"))
  }

  useEffect(() => {
    if (selectedDate) {
      loadConfirmados()
    }
  }, [selectedDate])

  const handleSortear = async () => {
    if (!pelada || !isAdmin) return
    setAnimating(true)
    setSorteando(true)
    setShowResult(false)

    try {
      // Anima por 2 segundos antes de mostrar o resultado
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const jogadores = confirmados.map((c) => ({
        user_id: c.user_id,
        nome: c.profile?.nome || "Jogador",
        avatar_url: c.profile?.avatar_url || null,
        tipo: "diarista",
      }))

      const result = await peladaService.realizarSorteio(
        peladaId,
        modo,
        jogadores,
        pelada.numero_times,
        pelada.jogadores_por_time,
      )

      if (result) {
        setTimesGerados(result.times)
        setShowResult(true)
        const h = await peladaService.getHistoricoSorteios(peladaId)
        setHistorico(h)
        toast({ title: "Sorteio realizado! 🎉", variant: "success" })
      } else {
        throw new Error("Resposta vazia do servidor")
      }
    } catch (error) {
      toast({
        title: "Erro ao realizar sorteio",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSorteando(false)
      setAnimating(false)
    }
  }

  const modos = [
    { value: "aleatorio" as SorteioModo, label: "Aleatório", desc: "Distribuição totalmente aleatória" },
    { value: "ordem_chegada" as SorteioModo, label: "Ordem de Chegada", desc: "Mantém a ordem registrada pelo admin" },
    { value: "priorizar_mensalistas" as SorteioModo, label: "Priorizar Mensalistas", desc: "Mensalistas são distribuídos primeiro" },
    { value: "equilibrado" as SorteioModo, label: "Equilibrado", desc: "Distribuição uniforme entre os times" },
  ]

  const dataAtual = new Date().toISOString().split("T")[0]

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
              <Button variant="gradient">Voltar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href={`/pelada/${peladaId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="w-7 h-7 rounded-md bg-[#00e676]/10 flex items-center justify-center">
                <span className="text-sm">⚽</span>
              </div>
              <span className="text-lg font-bold bg-gradient-brand bg-clip-text text-transparent">
                PeladaPro
              </span>
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
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-5xl mb-4"
              >
                🎲
              </motion.div>
              <h1 className="text-3xl font-bold mb-2">
                Sorteio de Times — {pelada.nome}
              </h1>
              <p className="text-muted-foreground">
                {isAdmin
                  ? "Configure o modo de sorteio e clique para sortear os times"
                  : "Aguardando o admin realizar o sorteio"}
              </p>
            </div>
          </FadeIn>

          {!isAdmin && !showResult && (
            <FadeIn>
              <Card className="text-center py-12">
                <CardContent>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-6xl mb-4"
                  >
                    ⏳
                  </motion.div>
                  <p className="text-muted-foreground">
                    O administrador da pelada irá realizar o sorteio.
                    <br />
                    Aguarde ou volte para a página da pelada.
                  </p>
                  <Link href={`/pelada/${peladaId}`} className="mt-4 inline-block">
                    <Button variant="outline">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Voltar
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Config Sidebar */}
              <div className="space-y-6">
                <FadeIn delay={0.1}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Shuffle className="h-5 w-5 text-primary" />
                        Configuração
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Date Selection */}
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Data do jogo
                        </label>
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          min={dataAtual}
                          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                      </div>

                      {/* Modo Selection */}
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">
                          Modo de sorteio
                        </label>
                        <Select
                          value={modo}
                          onValueChange={(v) => setModo(v as SorteioModo)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {modos.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {modos.find((m) => m.value === modo)?.desc}
                        </p>
                      </div>

                      {/* Confirmados Count */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {confirmados.length} jogadores confirmados
                      </div>

                      <Button
                        onClick={handleSortear}
                        variant="gradient"
                        size="lg"
                        className="w-full"
                        disabled={sorteando || !selectedDate || confirmados.length < 2}
                      >
                        {sorteando ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-5 w-5" />
                        )}
                        {showResult ? "Refazer Sorteio" : "Realizar Sorteio"}
                      </Button>
                    </CardContent>
                  </Card>
                </FadeIn>

                {/* Historico */}
                {historico.length > 0 && (
                  <FadeIn delay={0.2}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <History className="h-5 w-5 text-primary" />
                          Histórico
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {historico.slice(0, 5).map((h, i) => (
                          <div
                            key={h.id}
                            className="p-3 rounded-lg bg-muted/50 text-sm"
                          >
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {new Date(h.data_sorteio).toLocaleDateString("pt-BR")}
                              </span>
                              <span className="text-xs font-medium capitalize">
                                {h.modo.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {h.times.reduce((acc, t) => acc + t.jogadores.length, 0)} jogadores em {h.times.length} times
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </FadeIn>
                )}
              </div>

              {/* Result Area */}
              <div className="lg:col-span-2">
                {/* Animation State */}
                {animating && (
                  <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="text-8xl mb-6"
                      >
                        🎲
                      </motion.div>
                      <motion.p
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="text-xl font-semibold text-primary"
                      >
                        Sorteando...
                      </motion.p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Distribuindo {confirmados.length} jogadores em {pelada.numero_times} times
                      </p>
                    </div>
                  </div>
                )}

                {/* Result */}
                {showResult && !animating && (
                  <FadeIn>
                    <div className="space-y-6">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="text-center"
                      >
                        <Trophy className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                        <h2 className="text-2xl font-bold">
                          Times Sorteados! 🎉
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Modo: {modos.find((m) => m.value === modo)?.label}
                        </p>
                      </motion.div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {timesGerados.map((time, index) => {
                          const cor = CORES_TIMES[index % CORES_TIMES.length]
                          return (
                            <motion.div
                              key={time.nome}
                              initial={{ opacity: 0, y: 50, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.3 + index * 0.15, type: "spring", stiffness: 200 }}
                            >
                              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden hover:border-[#00e676]/20 transition-all duration-200"
                                style={{ borderTop: `3px solid ${index === 0 ? "#00e676" : index === 1 ? "#ff5252" : index === 2 ? "#3b82f6" : index === 3 ? "#ffab00" : "#6b7280"}` }}
                              >
                                <div className="p-5 pb-3">
                                  <h3 className="text-lg font-semibold text-[#fafafa] flex items-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${cor.bg}`} />
                                    {time.nome}
                                    <span className="text-xs text-[#6b7280] font-normal ml-auto">
                                      {time.jogadores.length} jogadores
                                    </span>
                                  </h3>
                                </div>
                                <div className="px-5 pb-5">
                                  <AnimatePresence>
                                    {time.jogadores.map((jogador, jIndex) => (
                                      <motion.div
                                        key={jogador.user_id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 + index * 0.15 + jIndex * 0.08 }}
                                        className="flex items-center gap-3 py-2 border-b border-[#2a2a2a] last:border-0"
                                      >
                                        <span className="text-xs text-muted-foreground w-5">
                                          {jIndex + 1}
                                        </span>
                                        {jogador.avatar_url ? (
                                          <Avatar className="h-8 w-8">
                                            <AvatarImage src={jogador.avatar_url} />
                                          </Avatar>
                                        ) : (
                                          <AvatarPlaceholder name={jogador.nome} size="sm" />
                                        )}
                                        <span className="text-sm font-medium">
                                          {jogador.nome}
                                        </span>
                                      </motion.div>
                                    ))}
                                  </AnimatePresence>
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>

                      <div className="flex justify-center gap-4 pt-4">
                        <Button
                          onClick={handleSortear}
                          variant="gradient"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Refazer Sorteio
                        </Button>
                        <Link href={`/pelada/${peladaId}`}>
                          <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Voltar
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </FadeIn>
                )}

                {/* No selection yet */}
                {!selectedDate && !animating && !showResult && (
                  <Card className="min-h-[400px] flex items-center justify-center">
                    <CardContent className="text-center">
                      <Shuffle className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-lg font-medium mb-2">
                        Selecione uma data e configure o sorteio
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Escolha a data do jogo e o modo de sorteio ao lado para começar.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Date selected but no confirmados */}
                {selectedDate && confirmados.length === 0 && !animating && !showResult && (
                  <Card className="min-h-[400px] flex items-center justify-center">
                    <CardContent className="text-center">
                      <Users className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-lg font-medium mb-2">
                        Nenhum jogador confirmado
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Para a data selecionada ({new Date(selectedDate).toLocaleDateString("pt-BR")}), 
                        nenhum jogador confirmou presença ainda.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </PageTransition>
      </main>
    </div>
  )
}
