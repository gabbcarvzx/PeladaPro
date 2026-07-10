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
import { BadgeStatus } from "@/components/ui/badge-status"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { SkeletonCard } from "@/components/ui/skeleton"
import { JogadorService, type JogadorStats } from "@/services/jogador-service"
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Users,
  Trophy,
  Flame,
  Shirt,
  Award,
} from "lucide-react"
import type { Pelada, Profile } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

const POSICOES_DISPONIVEIS = [
  "Goleiro",
  "Zagueiro",
  "Lateral",
  "Volante",
  "Meio-campo",
  "Atacante",
  "Ponta",
]

export default function JogadorPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const jogadorService = new JogadorService(supabase)
  const [userId, setUserId] = useState<string>("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<JogadorStats | null>(null)
  const [peladas, setPeladas] = useState<Pelada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setUserId(p.id))
  }, [params])

  useEffect(() => {
    if (!userId || !user) return
    loadJogador()
  }, [userId, user])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login")
    }
  }, [user, loading, router])

  const loadJogador = async () => {
    try {
      const [profileData, statsData, peladasData] = await Promise.all([
        jogadorService.getProfile(userId),
        jogadorService.getStats(userId),
        jogadorService.getPeladas(userId),
      ])

      if (!profileData) {
        setError("Jogador não encontrado")
      } else {
        setProfile(profileData)
        setStats(statsData)
        setPeladas(peladasData)
      }
    } catch {
      setError("Erro ao carregar perfil")
    }
    setLoading(false)
  }

  const isOwnProfile = user?.id === userId

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="text-5xl mb-4">😕</div>
            <CardTitle>Jogador não encontrado</CardTitle>
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
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[68px] items-center justify-between md:min-h-[76px]">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Logo />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Hero Card */}
          <FadeIn>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#121212] border border-[#00e676]/20 p-8 mb-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e676]/10 rounded-full blur-3xl" />
              <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  {profile.avatar_url ? (
                    <Avatar className="w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-[#00e676]/20">
                      <AvatarImage src={profile.avatar_url} alt={profile.nome} />
                    </Avatar>
                  ) : (
                    <AvatarPlaceholder name={profile.nome} size="xl" className="ring-4 ring-[#00e676]/20" />
                  )}
                </motion.div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#fafafa]">
                      {profile.nome}
                    </h1>
                    <BadgeStatus type={profile.role === "admin" ? "admin" : profile.tipo} />
                  </div>

                  {/* Número favorito */}
                  {profile.numero_favorito && (
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00e676]/10 text-[#00e676] text-sm font-bold border border-[#00e676]/20">
                        <Shirt className="h-3.5 w-3.5" />
                        #{profile.numero_favorito}
                      </span>
                    </div>
                  )}

                  {/* Posições */}
                  {profile.posicoes && profile.posicoes.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mb-3">
                      {profile.posicoes.map((pos) => (
                        <span
                          key={pos}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#121212] text-[#a3a3a3] text-xs border border-[#2a2a2a]"
                        >
                          {pos}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                    {isOwnProfile ? (
                      <Link href="/dashboard/profile">
                        <Button variant="outline" size="sm">
                          Editar Perfil
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/pelada/create`}>
                        <Button variant="glow" size="sm">
                          <Trophy className="mr-1.5 h-4 w-4" />
                          Convidar para Pelada
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Stats Cards */}
          {stats && (
            <FadeIn delay={0.1}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {/* Presença */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-[#00e676]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#6b7280] uppercase tracking-wider">Presença</p>
                        <p className="text-2xl font-bold text-[#fafafa]">{stats.percentualPresenca}%</p>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="w-full h-2 rounded-full bg-[#2a2a2a] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stats.percentualPresenca}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full rounded-full bg-[#00e676]"
                      />
                    </div>
                    <p className="text-xs text-[#6b7280] mt-2">
                      {stats.confirmados} de {stats.totalJogos} jogos
                    </p>
                  </div>
                </motion.div>

                {/* Streak */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#ffab00]/20 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#ffab00]/10 flex items-center justify-center">
                        <Flame className="h-5 w-5 text-[#ffab00]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#6b7280] uppercase tracking-wider">Streak 🔥</p>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-bold text-[#fafafa]">{stats.streak}</p>
                          <p className="text-sm text-[#6b7280]">jogos</p>
                        </div>
                      </div>
                    </div>
                    {stats.streak >= 3 && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-[#ffab00] mt-2"
                      >
                        {stats.streak >= 10 ? "🔥🔥🔥 Lendário!" :
                         stats.streak >= 5 ? "🔥🔥 Mandando bem!" :
                         "🔥 Aquecendo!"}
                      </motion.p>
                    )}
                  </div>
                </motion.div>

                {/* Total */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                        <Award className="h-5 w-5 text-[#00e676]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#6b7280] uppercase tracking-wider">Total de Jogos</p>
                        <p className="text-2xl font-bold text-[#fafafa]">{stats.totalJogos}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#6b7280] mt-2">
                      {stats.totalJogos === 0 ? "Nenhum jogo ainda" :
                       stats.totalJogos === 1 ? "1 jogo disputado" :
                       `${stats.totalJogos} jogos disputados`}
                    </p>
                  </div>
                </motion.div>
              </div>
            </FadeIn>
          )}

          {/* Peladas */}
          <FadeIn delay={0.3}>
            <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
              <div className="p-6 pb-4">
                <h2 className="text-lg font-semibold text-[#fafafa] flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#00e676]" />
                  Peladas
                </h2>
                <p className="text-sm text-[#6b7280]">
                  {peladas.length === 0
                    ? "Este jogador ainda não participa de nenhuma pelada."
                    : `${peladas.length} pelada${peladas.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="px-6 pb-6">
                {peladas.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-[#6b7280]/50 mx-auto mb-2" />
                    <p className="text-sm text-[#6b7280]">
                      Nenhuma pelada encontrada.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {peladas.map((pelada, i) => (
                      <motion.div
                        key={pelada.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Link href={`/pelada/${pelada.id}`}>
                          <div className="flex items-center justify-between p-4 rounded-lg bg-[#121212] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200 group cursor-pointer">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-[#00e676]" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-[#fafafa]">{pelada.nome}</p>
                                  {pelada.admin_id === userId && (
                                    <BadgeStatus type="admin" />
                                  )}
                                </div>
                                <p className="text-sm text-[#6b7280]">
                                  {pelada.recorrente && pelada.dia_semana !== null
                                    ? `Toda ${["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][pelada.dia_semana]}${pelada.horario ? ` às ${pelada.horario}` : ""}`
                                    : pelada.data
                                    ? new Date(pelada.data).toLocaleDateString("pt-BR")
                                    : "Data a definir"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FadeIn>
        </PageTransition>
      </main>
    </div>
  )
}
