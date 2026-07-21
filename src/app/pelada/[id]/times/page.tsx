"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { PeladaService } from "@/services/pelada-service"
import { CORES_TIMES } from "@/utils/constants"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  ArrowLeft,
  Trophy,
  Users,
  Calendar,
  Shuffle,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react"
import type { Pelada, HistoricoSorteio } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

export default function TimesPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [peladaId, setPeladaId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [historico, setHistorico] = useState<HistoricoSorteio[]>([])

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

  // Parseia times de forma segura
  const parseTimes = (times: unknown) => {
    if (Array.isArray(times)) return times
    if (typeof times === "string") {
      try { return JSON.parse(times) }
      catch { return [] }
    }
    return []
  }

  const totalJogadores = (sorteio: HistoricoSorteio) => {
    const times = parseTimes(sorteio.times)
    return times.reduce((acc: number, t: any) => acc + (t.jogadores?.length || 0), 0)
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
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-4">
        <Tabs value="times" onValueChange={(value) => {
          if (value === "info") router.push(`/pelada/${peladaId}`)
          else if (value === "sorteio") router.push(`/pelada/sorteio/${peladaId}`)
          else if (value === "ao-vivo") router.push(`/pelada/${peladaId}/ao-vivo`)
        }}>
          <TabsList className="w-full justify-start bg-[#1a1a1a] border border-[#2a2a2a] p-1 rounded-xl overflow-x-auto">
            <TabsTrigger value="info" className="flex items-center gap-2 data-[state=active]:bg-[#2a2a2a]">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Informações</span>
            </TabsTrigger>
            <TabsTrigger value="times" className="flex items-center gap-2 data-[state=active]:bg-[#2a2a2a]">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Times Sorteados</span>
            </TabsTrigger>
            <TabsTrigger value="sorteio" className="flex items-center gap-2 data-[state=active]:bg-[#2a2a2a]">
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Sorteio</span>
            </TabsTrigger>
            <TabsTrigger value="ao-vivo" className="flex items-center gap-2 data-[state=active]:bg-[#2a2a2a]">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Ao Vivo</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Title */}
          <FadeIn>
            <div className="text-center mb-8">
              <motion.div
                animate={{ y: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-5xl mb-4"
              >
                🏆
              </motion.div>
              <h1 className="text-3xl font-bold mb-2">
                Times Sorteados
              </h1>
              <p className="text-muted-foreground">
                {pelada.nome} — Visualização dos times gerados no último sorteio
              </p>
            </div>
          </FadeIn>

          {/* Empty State */}
          {historico.length === 0 && (
            <FadeIn>
              <Card className="text-center py-16">
                <CardContent>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Trophy className="h-20 w-20 text-muted-foreground/30 mx-auto mb-4" />
                  </motion.div>
                  <h2 className="text-xl font-semibold mb-2">
                    Nenhum sorteio realizado ainda
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    {isAdmin
                      ? "Vá para a página de sorteio para gerar os times."
                      : "O administrador irá realizar o sorteio em breve."}
                  </p>
                  {isAdmin && (
                    <Link href={`/pelada/sorteio/${peladaId}`}>
                      <Button variant="gradient">
                        <Shuffle className="mr-2 h-4 w-4" />
                        Ir para Sorteio
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {/* Sorteio History List */}
          {historico.length > 0 && (
            <div className="space-y-8">
              {historico.map((sorteio, sIndex) => {
                const times = parseTimes(sorteio.times)
                return (
                  <FadeIn key={sorteio.id} delay={sIndex * 0.1}>
                    <div>
                      {/* Sorteio Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {new Date(sorteio.data_sorteio).toLocaleDateString("pt-BR", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground bg-[#1a1a1a] px-2.5 py-1 rounded-full border border-[#2a2a2a]">
                            {totalJogadores(sorteio)} jogadores · {times.length} times
                          </span>
                          <span className="text-xs text-primary/60 bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20">
                            <Clock className="h-3 w-3 inline mr-1" />
                            Ordem de Chegada
                          </span>
                        </div>

                        {/* Admin: refazer sorteio */}
                        {isAdmin && sIndex === 0 && (
                          <Link href={`/pelada/sorteio/${peladaId}`}>
                            <Button variant="ghost" size="sm" className="text-xs">
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Refazer Sorteio
                            </Button>
                          </Link>
                        )}
                      </div>

                      {/* Times Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {times.map((time: any, tIndex: number) => {
                          const cor = CORES_TIMES[tIndex % CORES_TIMES.length]
                          const jogadores = time.jogadores || []
                          return (
                            <motion.div
                              key={time.nome + tIndex}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 + tIndex * 0.08 }}
                              className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden hover:border-[#00e676]/20 transition-all duration-200"
                            >
                              {/* Team Header */}
                              <div
                                className="px-5 py-4 border-b border-[#2a2a2a]"
                                style={{
                                  borderLeft: `4px solid ${
                                    ["#00e676", "#ff5252", "#3b82f6", "#ffab00", "#a855f7", "#fb923c", "#ec4899", "#6b7280"][tIndex % 8]
                                  }`,
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <h3 className="text-lg font-semibold text-[#fafafa] flex items-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${cor.bg}`} />
                                    {time.nome}
                                  </h3>
                                  <span className="text-xs text-[#6b7280] font-medium bg-[#121212] px-2.5 py-1 rounded-full border border-[#2a2a2a]">
                                    {jogadores.length} jogador{jogadores.length !== 1 ? "es" : ""}
                                  </span>
                                </div>
                              </div>

                              {/* Team Players */}
                              <div className="px-5 py-4">
                                {jogadores.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">
                                    Nenhum jogador neste time
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {jogadores.map((jogador: any, jIndex: number) => (
                                      <motion.div
                                        key={jogador.user_id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 + jIndex * 0.04 }}
                                        className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[#121212] transition-colors"
                                      >
                                        <span className="text-xs text-muted-foreground w-5 font-mono">
                                          {jIndex + 1}°
                                        </span>
                                        {jogador.avatar_url ? (
                                          <Avatar className="h-7 w-7">
                                            <AvatarImage src={jogador.avatar_url} />
                                          </Avatar>
                                        ) : (
                                          <AvatarPlaceholder name={jogador.nome} size="sm" />
                                        )}
                                        <span className="text-sm font-medium text-[#fafafa]">
                                          {jogador.nome}
                                        </span>
                                      </motion.div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  </FadeIn>
                )
              })}
            </div>
          )}
        </PageTransition>
      </main>
    </div>
  )
}
