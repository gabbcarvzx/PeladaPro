"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { PeladaService } from "@/services/pelada-service"
import {
  Loader2,
  Calendar,
  MapPin,
  Users,
  Shuffle,
  CheckCircle2,
  XCircle,
  LogIn,
  ArrowRight,
  UserPlus,
  Trophy,
  Clock,
  Repeat,
  Shield,
} from "lucide-react"
import type { Pelada, PeladaParticipante } from "@/types"

interface Props {
  params: Promise<{ invite_code: string }>
}

export default function EntrarPeladaPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [adminProfile, setAdminProfile] = useState<{ nome: string; avatar_url: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [peladaFull, setPeladaFull] = useState(false)
  const [inviteCode, setInviteCode] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setInviteCode(p.invite_code))
  }, [params])

  useEffect(() => {
    if (!inviteCode) return

    const loadPelada = async () => {
      try {
        const p = await peladaService.getByInviteCode(inviteCode)
        if (p) {
          setPelada(p)

          // Carregar admin
          const { data: admin } = await supabase
            .from("profiles")
            .select("nome, avatar_url")
            .eq("id", p.admin_id)
            .single()
          if (admin) setAdminProfile(admin)

          // Carregar contagem de participantes
          const participantes = await peladaService.getParticipantes(p.id)
          setParticipantCount(participantes.length)
          setPeladaFull(participantes.length >= p.limite_jogadores)

          // Verificar se o usuário já é participante
          if (user) {
            setIsParticipant(participantes.some((part) => part.user_id === user.id))
          }
        } else {
          setError("Link inválido ou pelada não encontrada.")
        }
      } catch {
        setError("Erro ao carregar pelada. Tente novamente.")
      }
      setLoading(false)
    }

    loadPelada()
  }, [inviteCode, user])

  const handleJoin = async () => {
    if (!user || !pelada) return
    setJoining(true)

    try {
      // RPC é idempotente (não gera erro se já participa) e bypassa RLS
      const success = await peladaService.addParticipante(pelada.id, user.id)

      if (success) {
        setIsParticipant(true)
        setParticipantCount((prev) => prev + 1)
        toast({
          title: `Você entrou em "${pelada.nome}"! 🎉`,
          description: "Agora você pode confirmar presença nos dias de jogo.",
          variant: "success",
        })
      } else if (peladaFull) {
        // Pelada lotada — adiciona como membro mesmo sem vaga
        const memberSuccess = await peladaService.adicionarMembro(pelada.id, user.id)

        if (memberSuccess) {
          setIsParticipant(true)
          setParticipantCount((prev) => prev + 1)
          toast({
            title: `Você entrou em "${pelada.nome}"! 🎉`,
            description: "A pelada está lotada no momento, mas você já é membro. Confirme presença nos próximos jogos.",
            variant: "success",
          })
        } else {
          toast({
            title: "Erro ao entrar",
            description: "Ocorreu um erro ao adicionar você à pelada.",
            variant: "destructive",
          })
          return // não redireciona em caso de erro
        }
      } else {
        toast({
          title: "Erro ao entrar",
          description: "Não foi possível entrar na pelada. Tente novamente.",
          variant: "destructive",
        })
        return // não redireciona em caso de erro
      }

      // Redireciona para o dashboard após sucesso
      // (evita race condition de RLS imediatamente após inserção)
      setTimeout(() => router.push("/dashboard"), 1500)
    } catch (error) {
      toast({
        title: "Erro ao entrar na pelada",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setJoining(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#00e676] mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Carregando convite...</p>
        </div>
      </div>
    )
  }

  // Estado de erro
  if (error || !pelada) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-animated opacity-10" />
        <PageTransition>
          <Card className="w-full max-w-md text-center border-destructive/20">
            <CardHeader>
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-6xl mb-4"
              >
                😕
              </motion.div>
              <CardTitle className="text-2xl">Convite não encontrado</CardTitle>
              <CardDescription className="text-base">
                {error || "Esta pelada não existe ou o link é inválido."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Verifique se o link está correto ou peça um novo convite ao organizador.
              </p>
              <Link href="/dashboard">
                <Button variant="gradient" className="w-full">
                  Ir para o Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </PageTransition>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-animated opacity-10" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#00e676]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

      <PageTransition>
        <Card className="w-full max-w-lg relative border-[#00e676]/10 overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#00e676] via-[#00e676]/80 to-[#00e676]/40" />

          <CardHeader className="text-center pb-2">
            <motion.div
              animate={{ rotate: [0, -8, 8, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-6xl mb-4"
            >
              ⚽
            </motion.div>

            {/* Badges */}
            <div className="flex items-center justify-center gap-2 mb-3">
              {pelada.recorrente && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00e676]/10 text-[#00e676] text-xs font-medium border border-[#00e676]/20">
                  <Repeat className="h-3.5 w-3.5" />
                  Recorrente semanal
                </span>
              )}
              {peladaFull && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-medium border border-yellow-500/20">
                  <Users className="h-3.5 w-3.5" />
                  Lotada
                </span>
              )}
            </div>

            <CardTitle className="text-3xl font-bold text-[#fafafa]">
              {pelada.nome}
            </CardTitle>
            {pelada.descricao && (
              <CardDescription className="text-base mt-2">
                {pelada.descricao}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Admin Info */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4 text-[#00e676]" />
              <span>Organizado por </span>
              {adminProfile?.avatar_url ? (
                <Avatar className="h-6 w-6 inline-block">
                  <AvatarImage src={adminProfile.avatar_url} />
                </Avatar>
              ) : (
                <AvatarPlaceholder name={adminProfile?.nome} size="sm" />
              )}
              <span className="font-medium text-[#fafafa]">{adminProfile?.nome || "Admin"}</span>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              {pelada.recorrente && pelada.dia_semana !== null && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#2a2a2a]">
                  <Calendar className="h-5 w-5 text-[#00e676] shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dia</p>
                    <p className="text-sm font-medium text-[#fafafa]">
                      {PeladaService.formatarDiaSemana(pelada.dia_semana)}
                    </p>
                  </div>
                </div>
              )}
              {pelada.horario && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#2a2a2a]">
                  <Clock className="h-5 w-5 text-[#00e676] shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Horário</p>
                    <p className="text-sm font-medium text-[#fafafa]">{pelada.horario}</p>
                  </div>
                </div>
              )}
              {pelada.local && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#2a2a2a]">
                  <MapPin className="h-5 w-5 text-[#00e676] shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Local</p>
                    <p className="text-sm font-medium text-[#fafafa] truncate">{pelada.local}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#2a2a2a]">
                <Users className="h-5 w-5 text-[#00e676] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Jogadores</p>
                  <p className="text-sm font-medium text-[#fafafa]">
                    {participantCount}/{pelada.limite_jogadores}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#2a2a2a]">
                <Shuffle className="h-5 w-5 text-[#00e676] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Times</p>
                  <p className="text-sm font-medium text-[#fafafa]">
                    {pelada.numero_times} × {pelada.jogadores_por_time}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Vagas preenchidas</span>
                <span className={`font-semibold ${peladaFull ? "text-yellow-500" : "text-[#00e676]"}`}>
                  {Math.round((participantCount / pelada.limite_jogadores) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#2a2a2a] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(participantCount / pelada.limite_jogadores) * 100}%`,
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    peladaFull ? "bg-yellow-500" : "bg-[#00e676]"
                  }`}
                />
              </div>
            </div>

            {/* Action Area */}
            {!user ? (
              <div className="space-y-3 pt-2">
                <Link href={`/auth/login?redirect=${encodeURIComponent(`/pelada/entrar/${inviteCode}`)}`}>
                  <Button variant="glow" size="lg" className="w-full h-12 text-base">
                    <LogIn className="mr-2 h-5 w-5" />
                    Fazer login para participar
                  </Button>
                </Link>
                <Link href={`/auth/register?redirect=${encodeURIComponent(`/pelada/entrar/${inviteCode}`)}`}>
                  <Button variant="outline" size="lg" className="w-full h-12 text-base">
                    <UserPlus className="mr-2 h-5 w-5" />
                    Criar conta grátis
                  </Button>
                </Link>
              </div>
            ) : isParticipant ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4 pt-2"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00e676]/10 mb-2">
                    <CheckCircle2 className="h-8 w-8 text-[#00e676]" />
                  </div>
                </motion.div>
                <div>
                  <p className="text-lg font-semibold text-[#fafafa]">
                    Você já é participante! 🎉
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Acesse a página da pelada para confirmar presença e ver os detalhes.
                  </p>
                </div>
                <Link href={`/pelada/${pelada.id}`}>
                  <Button variant="glow" size="lg" className="w-full h-12 text-base">
                    Acessar Pelada
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 pt-2"
              >
                {peladaFull && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-sm">
                    <Users className="h-5 w-5 text-yellow-500 shrink-0" />
                    <p className="text-yellow-500/90">
                      Pelada lotada no momento. Você ainda pode entrar como membro e confirmar presença em jogos futuros.
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleJoin}
                  variant="glow"
                  size="lg"
                  className="w-full h-12 text-base"
                  disabled={joining}
                >
                  {joining ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Trophy className="mr-2 h-5 w-5" />
                  )}
                  {joining ? "Entrando..." : "Participar desta Pelada!"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Ao participar, você concorda em seguir as regras da pelada.
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </PageTransition>
    </div>
  )
}
