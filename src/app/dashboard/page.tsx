"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { SkeletonCard } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toaster"
import {
  Plus,
  LogOut,
  Users,
  Calendar,
  Trophy,
  Settings,
  ChevronRight,
  Loader2,
  Copy,
  Settings2,
  Sparkles,
} from "lucide-react"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { EmptyState } from "@/components/ui/empty-state"
import { BadgeStatus } from "@/components/ui/badge-status"
import { AuthService } from "@/services/auth-service"
import { PeladaService } from "@/services/pelada-service"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import type { Pelada } from "@/types"

export default function DashboardPage() {
  const router = useRouter()
  const { supabase, user, profile, loading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [peladas, setPeladas] = useState<Pelada[]>([])
  const [loadingPeladas, setLoadingPeladas] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      loadPeladas()
    }
  }, [user])

  const loadPeladas = async () => {
    if (!user) return
    const data = await peladaService.getUserPeladas(user.id)
    setPeladas(data)
    setLoadingPeladas(false)
  }

  const handleLogout = async () => {
    const authService = new AuthService(supabase)
    await authService.logout()
    toast({ title: "Até logo!", description: "Você saiu da sua conta." })
  }

  const copyInviteLink = (pelada: Pelada) => {
    const link = `${window.location.origin}/pelada/join/${pelada.link_convite}`
    navigator.clipboard.writeText(link)
    toast({
      title: "Link copiado!",
      description: "Link de convite copiado para a área de transferência.",
      variant: "success",
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                <span className="text-base">⚽</span>
              </div>
              <span className="text-lg font-bold bg-gradient-brand bg-clip-text text-transparent">
                PeladaPro
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Link href="/dashboard/profile">
                <Button variant="ghost" size="sm" className="gap-2">
                  {profile?.avatar_url ? (
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={profile.avatar_url} alt={profile.nome} />
                    </Avatar>
                  ) : (
                    <AvatarPlaceholder name={profile?.nome} size="sm" />
                  )}
                  <span className="hidden sm:inline text-sm font-medium">
                    {profile?.nome?.split(" ")[0] || "Jogador"}
                  </span>
                </Button>
              </Link>
              <ThemeToggle />
              <Link href="/dashboard/profile">
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-5 w-5" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Welcome Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">
                Olá, {profile?.nome?.split(" ")[0] || "Jogador"}
              </h1>
              <p className="text-[#a3a3a3] mt-1">
                Gerencie suas peladas e confirme presença nos jogos.
              </p>
            </div>
            <Link href="/pelada/create">
              <Button variant="glow" size="lg">
                <Plus className="mr-2 h-5 w-5" />
                Nova Pelada
              </Button>
            </Link>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { icon: Calendar, label: "Peladas Ativas", value: peladas.length.toString() },
              { icon: Users, label: "Tipo", value: profile?.tipo === "mensalista" ? "Mensalista" : "Diarista" },
              { icon: Trophy, label: "Jogos Realizados", value: "0" },
              { icon: Settings, label: "Jogadores Totais", value: "—" },
            ].map((stat, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-[#00e676]" />
                    </div>
                    <div>
                      <p className="text-sm text-[#6b7280]">{stat.label}</p>
                      <p className="text-2xl font-bold text-[#fafafa]">{stat.value}</p>
                    </div>
                  </div>
                </div>
                </motion.div>
              </FadeIn>
            ))}
          </div>

          {/* Peladas List */}
          <FadeIn>
            <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#fafafa]">Minhas Peladas</h2>
                  <p className="text-sm text-[#6b7280]">
                    Gerencie suas peladas ou crie uma nova para começar.
                  </p>
                </div>
              </div>
              <div className="px-6 pb-6">
                {loadingPeladas ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : peladas.length === 0 ? (
                  <EmptyState
                    icon={Calendar}
                    title="Nenhuma pelada ainda"
                    description="Crie sua primeira pelada ou entre em uma através de um link de convite."
                    action={
                      <Link href="/pelada/create">
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button variant="glow">
                            <Plus className="mr-2 h-5 w-5" />
                            Criar Pelada
                          </Button>
                        </motion.div>
                      </Link>
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {peladas.map((pelada, i) => (
                      <motion.div
                        key={pelada.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <div className="flex items-center justify-between p-4 rounded-lg bg-[#121212] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200 group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                              <Calendar className="h-5 w-5 text-[#00e676]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-[#fafafa]">{pelada.nome}</p>
                                {pelada.admin_id === user?.id && (
                                  <BadgeStatus type="admin" />
                                )}
                              </div>
                              <p className="text-sm text-[#6b7280]">
                                {pelada.jogadores_por_time}v{pelada.jogadores_por_time} · {pelada.numero_times} times · {pelada.limite_jogadores} jogadores
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyInviteLink(pelada)}
                              title="Copiar link de convite"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Link href={`/pelada/${pelada.id}`}>
                              <Button variant="ghost" size="sm">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>
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
