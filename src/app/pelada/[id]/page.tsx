"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { PeladaService } from "@/services/pelada-service"
import {
  Loader2,
  Calendar,
  MapPin,
  Users,
  Shuffle,
  Copy,
  Trash2,
  Crown,
  CheckCircle2,
  XCircle,

  ArrowLeft,
  UserMinus,
  Settings2,
  ChevronDown,
  ChevronUp,
  LogOut,
} from "lucide-react"
import type { Pelada, PeladaParticipante, ConfirmacaoDia } from "@/types"

interface Props {
  params: Promise<{ id: string }>
}

export default function PeladaDetailPage({ params }: Props) {
  const router = useRouter()
  const { supabase, user, profile, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)
  const [pelada, setPelada] = useState<Pelada | null>(null)
  const [participantes, setParticipantes] = useState<PeladaParticipante[]>([])
  const [loading, setLoading] = useState(true)
  const [peladaId, setPeladaId] = useState<string>("")
  const [confirmingDate, setConfirmingDate] = useState("")
  const [showParticipants, setShowParticipants] = useState(true)
  const [confirmacoes, setConfirmacoes] = useState<ConfirmacaoDia[]>([])
  const [showConfirmacoes, setShowConfirmacoes] = useState(false)

  const isAdmin = user?.id === pelada?.admin_id

  useEffect(() => {
    params.then((p) => setPeladaId(p.id))
  }, [params])

  useEffect(() => {
    if (!peladaId || !user) return
    loadPelada()
  }, [peladaId, user])

  useEffect(() => {
    if (confirmingDate && user) {
      loadConfirmacoes()
    }
  }, [confirmingDate])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login")
    }
  }, [user, loading, router])

  const loadPelada = async () => {
    const p = await peladaService.getById(peladaId)
    if (p) {
      setPelada(p)
      const parts = await peladaService.getParticipantes(peladaId)
      setParticipantes(parts)
    }
    setLoading(false)
  }

  const handleCopyLink = () => {
    if (!pelada) return
    const link = `${window.location.origin}/pelada/join/${pelada.link_convite}`
    navigator.clipboard.writeText(link)
    toast({
      title: "Link copiado!",
      description: "Compartilhe com os jogadores.",
      variant: "success",
    })
  }

  const handleRemoveParticipant = async (userId: string) => {
    if (!confirm("Remover este jogador da pelada?")) return
    await peladaService.removeParticipante(peladaId, userId)
    setParticipantes((prev) => prev.filter((p) => p.user_id !== userId))
    toast({ title: "Jogador removido" })
  }

  const handleAlterarTipo = async (userId: string, tipo: "mensalista" | "diarista") => {
    await peladaService.alterarTipoJogador(peladaId, userId, tipo)
    setParticipantes((prev) =>
      prev.map((p) => (p.user_id === userId ? { ...p, tipo } : p)),
    )
    toast({ title: "Tipo alterado", variant: "success" })
  }

  const handleDeletePelada = async () => {
    if (!confirm("Tem certeza? Esta ação não pode ser desfeita.")) return
    await peladaService.delete(peladaId)
    toast({ title: "Pelada excluída" })
    router.push("/dashboard")
  }

  const handleSair = async () => {
    if (!user) return
    await peladaService.removeParticipante(peladaId, user.id)
    toast({ title: "Você saiu da pelada" })
    router.push("/dashboard")
  }

  const loadConfirmacoes = async () => {
    if (!confirmingDate) return
    const confs = await peladaService.getConfirmacoes(peladaId, confirmingDate)
    setConfirmacoes(confs)
    setShowConfirmacoes(true)
  }

  const handleConfirmarPresenca = async () => {
    if (!user || !confirmingDate) return
    await peladaService.confirmarPresenca(peladaId, user.id, confirmingDate)
    toast({ title: "Presença confirmada!", variant: "success" })
    await loadConfirmacoes()
  }

  const handleRecusarPresenca = async () => {
    if (!user || !confirmingDate) return
    await peladaService.recusarPresenca(peladaId, user.id, confirmingDate)
    toast({ title: "Presença recusada" })
    await loadConfirmacoes()
  }

  const handleConfirmarChegada = async (userId: string, ordem: number) => {
    if (!confirmingDate) return
    await peladaService.confirmarChegada(peladaId, userId, confirmingDate, ordem)
    toast({ title: `Chegada confirmada! Ordem: ${ordem}º`, variant: "success" })
    await loadConfirmacoes()
  }

  const confirmadosCount = confirmacoes.filter((c) => c.status === "confirmado").length
  const recusadosCount = confirmacoes.filter((c) => c.status === "recusado").length
  const pendentes = participantes.filter(
    (p) => !confirmacoes.find((c) => c.user_id === p.user_id),
  ).length

  const getProximaOrdem = () => {
    const maxOrdem = confirmacoes.reduce(
      (max, c) => Math.max(max, c.ordem_chegada || 0),
      0,
    )
    return maxOrdem + 1
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
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <span className="text-2xl">⚽</span>
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                PeladaPro
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="ghost" size="icon" onClick={handleDeletePelada}>
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
              )}
              {!isAdmin && user && (
                <Button variant="ghost" size="sm" onClick={handleSair}>
                  <LogOut className="h-4 w-4 mr-1" /> Sair
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Hero Section */}
          <FadeIn>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark to-dark-light border border-primary/20 p-8 mb-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {isAdmin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-medium">
                          <Crown className="h-3 w-3" /> Admin
                        </span>
                      )}
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                      {pelada.nome}
                    </h1>
                    {pelada.descricao && (
                      <p className="text-white/70 mb-4">{pelada.descricao}</p>
                    )}
                  </div>
                  <Button
                    onClick={handleCopyLink}
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                  <div className="flex items-center gap-2 text-white/80">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      {pelada.data
                        ? new Date(pelada.data).toLocaleDateString("pt-BR")
                        : "A definir"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-white/80">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm">{pelada.local || "A definir"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/80">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      {participantes.length}/{pelada.limite_jogadores} jogadores
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-white/80">
                    <Shuffle className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      {pelada.numero_times}×{pelada.jogadores_por_time}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${
                        (participantes.length / pelada.limite_jogadores) * 100
                      }%`,
                    }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
              </div>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Participants Section */}
            <div className="lg:col-span-2">
              <FadeIn>
                <Card>
                  <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => setShowParticipants(!showParticipants)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-primary" />
                          Participantes
                        </CardTitle>
                        <CardDescription>
                          {participantes.length} jogadores confirmados
                        </CardDescription>
                      </div>
                      {showParticipants ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>

                  <AnimatePresence>
                    {showParticipants && (
                      <CardContent>
                        <StaggerContainer className="space-y-2">
                          {participantes.map((participante, i) => (
                            <StaggerItem key={participante.id}>
                              <motion.div
                                layout
                                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                              >
                                <div className="flex items-center gap-3">
                                  {participante.profile?.avatar_url ? (
                                    <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                                      <AvatarImage src={participante.profile.avatar_url} />
                                    </Avatar>
                                  ) : (
                                    <AvatarPlaceholder name={participante.profile?.nome} size="md" />
                                  )}
                                  <div>
                                    <p className="font-medium text-sm">
                                      {participante.profile?.nome || "Jogador"}
                                      {participante.user_id === pelada.admin_id && (
                                        <Crown className="inline h-3 w-3 text-yellow-500 ml-1" />
                                      )}
                                    </p>
                                    <span
                                      className={`text-xs font-medium ${
                                        participante.tipo === "mensalista"
                                          ? "text-primary"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      {participante.tipo === "mensalista"
                                        ? "Mensalista"
                                        : "Diarista"}
                                    </span>
                                  </div>
                                </div>

                                {/* Admin Actions */}
                                {isAdmin &&
                                  participante.user_id !== pelada.admin_id && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Select
                                        value={participante.tipo}
                                        onValueChange={(v) =>
                                          handleAlterarTipo(
                                            participante.user_id,
                                            v as "mensalista" | "diarista",
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-32 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="mensalista">
                                            Mensalista
                                          </SelectItem>
                                          <SelectItem value="diarista">
                                            Diarista
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() =>
                                          handleRemoveParticipant(
                                            participante.user_id,
                                          )
                                        }
                                      >
                                        <UserMinus className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  )}
                              </motion.div>
                            </StaggerItem>
                          ))}

                          {participantes.length === 0 && (
                            <EmptyState
                              icon={Users}
                              title="Nenhum participante ainda"
                              description="Compartilhe o link de convite para adicionar jogadores."
                            />
                          )}
                        </StaggerContainer>
                      </CardContent>
                    )}
                  </AnimatePresence>
                </Card>
              </FadeIn>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Confirm Presence */}
              <FadeIn delay={0.1}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      Confirmar Presença
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        Data do jogo
                      </label>
                      <input
                        type="date"
                        value={confirmingDate}
                        onChange={(e) => setConfirmingDate(e.target.value)}
                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleConfirmarPresenca}
                        variant="gradient"
                        size="sm"
                        className="flex-1"
                        disabled={!confirmingDate}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        Confirmar
                      </Button>
                      <Button
                        onClick={handleRecusarPresenca}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={!confirmingDate}
                      >
                        <XCircle className="mr-1 h-4 w-4 text-destructive" />
                        Recusar
                      </Button>
                    </div>

                    {/* Status Summary */}
                    {showConfirmacoes && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            Confirmados
                          </span>
                          <span className="font-semibold text-primary">{confirmadosCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-destructive/5">
                          <span className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-destructive" />
                            Recusados
                          </span>
                          <span className="font-semibold text-destructive">{recusadosCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Pendentes
                          </span>
                          <span className="font-semibold">{pendentes}</span>
                        </div>
                      </div>
                    )}

                    {/* Admin Check-in Panel */}
                    {isAdmin && showConfirmacoes && confirmadosCount > 0 && (
                      <div className="border-t border-border pt-4 mt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                          Ordem de Chegada
                        </p>
                        <div className="space-y-2">
                          {confirmacoes
                            .filter((c) => c.status === "confirmado")
                            .sort((a, b) => (a.ordem_chegada || 999) - (b.ordem_chegada || 999))
                            .map((conf) => (
                              <div
                                key={conf.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                              >
                                <div className="flex items-center gap-2">
                                  {conf.profile?.avatar_url ? (
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={conf.profile.avatar_url} />
                                    </Avatar>
                                  ) : (
                                    <AvatarPlaceholder name={conf.profile?.nome} size="sm" />
                                  )}
                                  <span className="text-xs">{conf.profile?.nome}</span>
                                </div>
                                {conf.ordem_chegada ? (
                                  <span className="text-xs font-medium text-primary">
                                    {conf.ordem_chegada}º
                                  </span>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() =>
                                      handleConfirmarChegada(
                                        conf.user_id,
                                        getProximaOrdem(),
                                      )
                                    }
                                  >
                                    Confirmar
                                  </Button>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>

              {/* Sorteio */}
              <FadeIn delay={0.2}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shuffle className="h-5 w-5 text-primary" />
                      Sorteio de Times
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {isAdmin
                        ? "Clique abaixo para realizar o sorteio dos times com os jogadores confirmados."
                        : "O admin irá realizar o sorteio dos times."}
                    </p>

                    {isAdmin && (
                      <Link href={`/pelada/sorteio/${pelada.id}`}>
                        <Button variant="gradient" className="w-full">
                          <Shuffle className="mr-2 h-4 w-4" />
                          Realizar Sorteio
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>

              {/* Info */}
              <FadeIn delay={0.3}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-primary" />
                      Detalhes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criada em</span>
                      <span>
                        {new Date(pelada.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Times</span>
                      <span>{pelada.numero_times}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Jog/Time</span>
                      <span>{pelada.jogadores_por_time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vagas</span>
                      <span>
                        {participantes.length}/{pelada.limite_jogadores}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Link</span>
                      <button
                        onClick={handleCopyLink}
                        className="text-primary hover:underline"
                      >
                        Copiar
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  )
}
