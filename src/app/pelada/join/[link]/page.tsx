"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
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
  ListOrdered,
} from "lucide-react"
import type { Pelada } from "@/types"

interface Props {
  params: Promise<{ link: string }>
}

export default function JoinPeladaPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)
  const [peladaFull, setPeladaFull] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [link, setLink] = useState<string>("")
  const [filaCount, setFilaCount] = useState(0)
  const [enteredFila, setEnteredFila] = useState(false)
  const [filaPosicao, setFilaPosicao] = useState(0)

  useEffect(() => {
    params.then((p) => setLink(p.link))
  }, [params])

  useEffect(() => {
    if (!link) return

    const loadPelada = async () => {
      const p = await peladaService.getByLink(link)
      if (p) {
        setPelada(p)
        // Carregar contagem de participantes
        const participantes = await peladaService.getParticipantes(p.id)
        setParticipantCount(participantes.length)
        setPeladaFull(participantes.length >= p.limite_jogadores)

        // Verificar se o usuário já é participante
        if (user) {
          setIsParticipant(participantes.some((part) => part.user_id === user.id))
        }
      }
      setLoading(false)
    }

    loadPelada()
  }, [link, user])

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
          title: "Você entrou na pelada! 🎉",
          description: `Agora você faz parte de "${pelada.nome}"`,
          variant: "success",
        })
      } else if (peladaFull) {
        // Pelada lotada — adiciona como membro mesmo sem vaga
        const memberSuccess = await peladaService.adicionarMembro(pelada.id, user.id)

        if (memberSuccess) {
          setIsParticipant(true)
          setParticipantCount((prev) => prev + 1)
          toast({
            title: "Você entrou na pelada! 🎉",
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
      setTimeout(() => router.push("/dashboard"), 1500)
    } catch (error) {
      toast({
        title: "Erro ao entrar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setJoining(false)
    }
  }

  const handleEntrarFila = async () => {
    if (!user || !pelada || !pelada.data) return
    setJoining(true)
    try {
      // Primeiro adiciona como participante
      const success = await peladaService.addParticipante(pelada.id, user.id)
      if (!success) {
        toast({
          title: "Erro ao entrar",
          description: "Não foi possível entrar na pelada.",
          variant: "destructive",
        })
        return
      }

      // Depois tenta confirmar presença (vai para fila se lotado)
      const dataJogo = pelada.data.split("T")[0]
      const result = await peladaService.confirmarPresenca(pelada.id, user.id, dataJogo)

      if (result.status === "fila") {
        setEnteredFila(true)
        setFilaPosicao(result.posicao || 0)
        setIsParticipant(true)
        toast({
          title: "Você entrou na fila de espera!",
          description: `Sua posição: ${result.posicao}º — Quando abrir vaga, você será chamado automaticamente.`,
          variant: "success",
        })
        // Carregar contagem atualizada da fila
        const fila = await peladaService.getFilaEspera(pelada.id, dataJogo)
        setFilaCount(fila.length)
      } else {
        setIsParticipant(true)
        setParticipantCount((prev) => prev + 1)
        toast({
          title: "Você entrou na pelada! 🎉",
          description: `Agora você faz parte de "${pelada.nome}"`,
          variant: "success",
        })
      }
    } catch (error) {
      toast({
        title: "Erro ao entrar na fila",
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!pelada) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-5xl mb-4"
            >
              😕
            </motion.div>
            <CardTitle>Link não encontrado</CardTitle>
            <CardDescription>
              Esta pelada não existe ou o link é inválido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button variant="gradient">
                Ir para o Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-animated opacity-10" />
      <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl" />

      <PageTransition>
        <Card className="w-full max-w-lg relative glass border-primary/20">
          <CardHeader className="text-center">
            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-5xl mb-4"
            >
              ⚽
            </motion.div>
            <CardTitle className="text-3xl">{pelada.nome}</CardTitle>
            {pelada.descricao && (
              <CardDescription className="text-base">
                {pelada.descricao}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="text-sm font-medium">
                    {pelada.data
                      ? new Date(pelada.data).toLocaleDateString("pt-BR")
                      : "A definir"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Local</p>
                  <p className="text-sm font-medium">
                    {pelada.local || "A definir"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Jogadores</p>
                  <p className="text-sm font-medium">
                    {participantCount}/{pelada.limite_jogadores}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Shuffle className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Times</p>
                  <p className="text-sm font-medium">
                    {pelada.numero_times} × {pelada.jogadores_por_time}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vagas preenchidas</span>
                <span className="font-medium">
                  {Math.round((participantCount / pelada.limite_jogadores) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(participantCount / pelada.limite_jogadores) * 100}%`,
                  }}
                  className={`h-full rounded-full ${
                    peladaFull ? "bg-destructive" : "bg-primary"
                  }`}
                />
              </div>
            </div>

            {/* Action Buttons */}
            {!user ? (
              <div className="space-y-3">
                <Link href={`/auth/login?redirect=/pelada/join/${link}`}>
                  <Button variant="gradient" size="lg" className="w-full">
                    <LogIn className="mr-2 h-5 w-5" />
                    Fazer login para entrar
                  </Button>
                </Link>
                <Link href={`/auth/register?redirect=/pelada/join/${link}`}>
                  <Button variant="outline" size="lg" className="w-full">
                    Criar conta
                  </Button>
                </Link>
              </div>
            ) : isParticipant ? (
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                </motion.div>
                <p className="text-sm text-muted-foreground">
                  Você já é participante desta pelada!
                </p>
                <Link href={`/pelada/${pelada.id}`}>
                  <Button variant="gradient" size="lg" className="w-full">
                    Ver detalhes
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            ) : peladaFull && !enteredFila ? (
              <div className="text-center space-y-4">
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Pelada lotada! O limite de {pelada.limite_jogadores} jogadores
                  já foi atingido.
                </p>
                {pelada.data && (
                  <Button
                    onClick={handleEntrarFila}
                    variant="outline"
                    size="lg"
                    className="w-full"
                    disabled={joining}
                  >
                    {joining ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <ListOrdered className="mr-2 h-5 w-5" />
                    )}
                    Entrar na lista de espera
                  </Button>
                )}
              </div>
            ) : enteredFila ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center space-y-3"
              >
                <ListOrdered className="h-12 w-12 text-primary mx-auto" />
                <p className="font-semibold text-lg">Você está na fila de espera!</p>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary text-2xl font-bold">
                  {filaPosicao}º
                </div>
                <p className="text-sm text-muted-foreground">
                  {filaPosicao === 1
                    ? "Você é o próximo! Quando alguém desistir, entra automaticamente."
                    : `Você está em ${filaPosicao}º lugar na fila. Quando sua vez chegar, você será notificado.`}
                </p>
                <Link href={`/pelada/${pelada.id}`}>
                  <Button variant="gradient" size="lg" className="w-full">
                    Ver detalhes
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <Button
                onClick={handleJoin}
                variant="gradient"
                size="lg"
                className="w-full"
                disabled={joining}
              >
                {joining ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                Confirmar participação
              </Button>
            )}
          </CardContent>
        </Card>
      </PageTransition>
    </div>
  )
}
