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
import { Logo } from "@/components/ui/logo"
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
  ListOrdered,
  UserPlus,
  ArrowUp,
  Zap,
  Swords,
  Repeat,
} from "lucide-react"
import type { Pelada, PeladaOcorrencia, PeladaParticipante, ConfirmacaoDia, ListaEspera } from "@/types"
import { BadgeStatus } from "@/components/ui/badge-status"

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
  const [filaEspera, setFilaEspera] = useState<ListaEspera[]>([])
  const [showFila, setShowFila] = useState(false)
  const [minhaPosicaoFila, setMinhaPosicaoFila] = useState(0)
  const [promovidoInfo, setPromovidoInfo] = useState<{ nome: string } | null>(null)
  const [ocorrenciaAtual, setOcorrenciaAtual] = useState<PeladaOcorrencia | null>(null)

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
      loadFilaEspera()
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

      // Para peladas recorrentes, obtém ou cria a próxima ocorrência
      if (p.recorrente) {
        const oc = await peladaService.getOrCreateProximaOcorrencia(peladaId)
        if (oc) {
          setOcorrenciaAtual(oc)
          setConfirmingDate(oc.data)
        }
      }
    }
    setLoading(false)
  }

  const handleCopyLink = () => {
    if (!pelada) return
    const link = `${window.location.origin}/pelada/entrar/${pelada.invite_code}`
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

  const loadFilaEspera = async () => {
    if (!confirmingDate || !user) return
    const fila = await peladaService.getFilaEspera(peladaId, confirmingDate)
    setFilaEspera(fila)
    setShowFila(true)
    const minhaPos = await peladaService.getPosicaoFila(peladaId, user.id, confirmingDate)
    setMinhaPosicaoFila(minhaPos)
  }

  const handleConfirmarPresenca = async () => {
    if (!user || !confirmingDate) return
    const result = await peladaService.confirmarPresenca(peladaId, user.id, confirmingDate, ocorrenciaAtual?.id)

    if (result.status === "fila") {
      toast({
        title: "Pelada lotada — você foi para a fila de espera!",
        description: `Sua posição: ${result.posicao}º`, 
        variant: "default",
      })
    } else {
      toast({ title: "Presença confirmada!", variant: "success" })
    }
    await loadConfirmacoes()
    await loadFilaEspera()
  }

  const handleRecusarPresenca = async () => {
    if (!user || !confirmingDate) return
    const result = await peladaService.recusarPresenca(peladaId, user.id, confirmingDate, ocorrenciaAtual?.id)

    if (result.promovido && result.nomePromovido) {
      setPromovidoInfo({ nome: result.nomePromovido })
      toast({
        title: "Presença recusada — alguém foi chamado!",
        description: `${result.nomePromovido} foi promovido da fila de espera.`,
        variant: "default",
      })
    } else {
      toast({ title: "Presença recusada" })
    }
    await loadConfirmacoes()
    await loadFilaEspera()
  }

  const handleConfirmarChegada = async (userId: string, ordem: number) => {
    if (!confirmingDate) return
    await peladaService.confirmarChegada(peladaId, userId, confirmingDate, ordem)
    toast({ title: `Chegada confirmada! Ordem: ${ordem}º`, variant: "success" })
    await loadConfirmacoes()
  }

  const handlePromoverDaFila = async (userId: string) => {
    if (!confirmingDate) return
    const success = await peladaService.adminPromoverDaFila(peladaId, userId, confirmingDate)
    if (success) {
      toast({ title: "Jogador promovido da fila!", variant: "success" })
    } else {
      toast({ title: "Erro ao promover jogador", variant: "destructive" })
    }
    await loadConfirmacoes()
    await loadFilaEspera()
  }

  const handleRemoverDaFila = async (userId: string) => {
    if (!confirmingDate || !confirm("Remover este jogador da fila de espera?")) return
    await peladaService.sairFilaEspera(peladaId, userId, confirmingDate)
    toast({ title: "Jogador removido da fila" })
    await loadFilaEspera()
  }

  const handleSairDaFila = async () => {
    if (!user || !confirmingDate) return
    await peladaService.sairFilaEspera(peladaId, user.id, confirmingDate)
    setMinhaPosicaoFila(0)
    toast({ title: "Você saiu da fila de espera" })
    await loadFilaEspera()
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
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[68px] items-center justify-between md:min-h-[76px]">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Logo />
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
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#121212] border border-[#00e676]/20 p-8 mb-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e676]/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {isAdmin && <BadgeStatus type="admin" />}
                      {pelada.recorrente && pelada.dia_semana !== null && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00e676]/10 text-[#00e676] text-xs font-medium border border-[#00e676]/20">
                          <Repeat className="h-3 w-3" />
                          Recorrente semanal
                        </span>
                      )}
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-[#fafafa] mb-2">
                      {pelada.nome}
                    </h1>
                    {pelada.descricao && (
                      <p className="text-[#6b7280] mb-4">{pelada.descricao}</p>
                    )}
                    {pelada.recorrente && pelada.dia_semana !== null && (
                      <p className="text-sm text-[#00e676] mt-1 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Toda {PeladaService.formatarDiaSemana(pelada.dia_semana)}{pelada.horario ? ` às ${pelada.horario}` : ''}
                        {ocorrenciaAtual && (
                          <span className="text-[#fafafa]/70 ml-1">
                            · Próxima: {new Date(ocorrenciaAtual.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </p>
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
                  <div className="flex items-center gap-2 text-[#a3a3a3]">
                    <Calendar className="h-4 w-4 text-[#00e676]" />
                    <span className="text-sm">
                      {pelada.data
                        ? new Date(pelada.data).toLocaleDateString("pt-BR")
                        : "A definir"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#a3a3a3]">
                    <MapPin className="h-4 w-4 text-[#00e676]" />
                    <span className="text-sm">{pelada.local || "A definir"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#a3a3a3]">
                    <Users className="h-4 w-4 text-[#00e676]" />
                    <span className="text-sm">
                      {participantes.length}/{pelada.limite_jogadores} jogadores
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#a3a3a3]">
                    <Shuffle className="h-4 w-4 text-[#00e676]" />
                    <span className="text-sm">
                      {pelada.numero_times}×{pelada.jogadores_por_time}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 w-full h-2 rounded-full bg-[#ffffff10] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${
                        (participantes.length / pelada.limite_jogadores) * 100
                      }%`,
                    }}
                    className="h-full rounded-full bg-[#00e676]"
                  />
                </div>
              </div>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Participants Section */}
            <div className="lg:col-span-2">
              <FadeIn>
                <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
                  <div
                    className="flex items-center justify-between p-6 pb-4 cursor-pointer select-none"
                    onClick={() => setShowParticipants(!showParticipants)}
                  >
                    <div>
                      <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                        <Users className="h-5 w-5 text-[#00e676]" />
                        Participantes
                      </h3>
                      <p className="text-sm text-[#6b7280]">
                        {participantes.length} jogadores
                      </p>
                    </div>
                    {showParticipants ? (
                      <ChevronUp className="h-5 w-5 text-[#6b7280]" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-[#6b7280]" />
                    )}
                  </div>

                  <AnimatePresence>
                    {showParticipants && (
                      <div className="px-6 pb-6">
                        <StaggerContainer className="space-y-1">
                          {participantes.map((participante, i) => (
                            <StaggerItem key={participante.id}>
                              <motion.div
                                layout
                                className="flex items-center justify-between p-3 rounded-lg bg-[#121212] border border-[#2a2a2a] hover:border-[#00e676]/10 transition-all duration-200 group"
                              >
                                <div className="flex items-center gap-3">
                                  {participante.profile?.avatar_url ? (
                                    <Avatar className="h-10 w-10 ring-2 ring-[#00e676]/10">
                                      <AvatarImage src={participante.profile.avatar_url} />
                                    </Avatar>
                                  ) : (
                                    <AvatarPlaceholder name={participante.profile?.nome} size="md" />
                                  )}
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm text-[#fafafa]">
                                      {participante.profile?.nome || "Jogador"}
                                      {participante.user_id === pelada.admin_id && (
                                        <BadgeStatus type="admin" className="ml-1" />
                                      )}
                                    </p>
                                    <BadgeStatus type={participante.tipo} />
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
                                        <SelectTrigger className="h-8 w-28 text-xs bg-[#1a1a1a] border-[#2a2a2a]">
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
                                        <UserMinus className="h-4 w-4 text-[#ff5252]" />
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
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeIn>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Confirm Presence */}
              <FadeIn delay={0.1}>
                <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                  <div className="p-6 pb-4">
                    <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[#00e676]" />
                      Confirmar Presença
                    </h3>
                  </div>
                  <div className="px-6 pb-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-[#6b7280]">
                        Data do jogo
                      </label>
                      <input
                        type="date"
                        value={confirmingDate}
                        onChange={(e) => setConfirmingDate(e.target.value)}
                        className="w-full h-10 rounded-lg border border-[#2a2a2a] bg-[#121212] px-3 text-sm text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#00e676] transition-all"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleConfirmarPresenca}
                        variant="glow"
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
                        <XCircle className="mr-1 h-4 w-4 text-[#ff5252]" />
                        Recusar
                      </Button>
                    </div>

                    {/* Status Summary */}
                    {showConfirmacoes && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-[#00e676]/5 border border-[#00e676]/10">
                          <span className="flex items-center gap-1 text-[#00e676]">
                            <CheckCircle2 className="h-4 w-4" />
                            Confirmados
                          </span>
                          <span className="font-semibold text-[#00e676]">{confirmadosCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-[#ff5252]/5 border border-[#ff5252]/10">
                          <span className="flex items-center gap-1 text-[#ff5252]">
                            <XCircle className="h-4 w-4" />
                            Recusados
                          </span>
                          <span className="font-semibold text-[#ff5252]">{recusadosCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-[#6b7280]/5 border border-[#2a2a2a]">
                          <span className="flex items-center gap-1 text-[#6b7280]">
                            <Users className="h-4 w-4" />
                            Pendentes
                          </span>
                          <span className="font-semibold">{pendentes}</span>
                        </div>
                      </div>
                    )}

                    {/* Admin Check-in Panel */}
                    {isAdmin && showConfirmacoes && confirmadosCount > 0 && (
                      <div className="border-t border-[#2a2a2a] pt-4 mt-2">
                        <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-3">
                          Ordem de Chegada
                        </p>
                        <div className="space-y-2">
                          {confirmacoes
                            .filter((c) => c.status === "confirmado")
                            .sort((a, b) => (a.ordem_chegada || 999) - (b.ordem_chegada || 999))
                            .map((conf) => (
                              <div
                                key={conf.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-[#121212] border border-[#2a2a2a]"
                              >
                                <div className="flex items-center gap-2">
                                  {conf.profile?.avatar_url ? (
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={conf.profile.avatar_url} />
                                    </Avatar>
                                  ) : (
                                    <AvatarPlaceholder name={conf.profile?.nome} size="sm" />
                                  )}
                                  <span className="text-xs text-[#fafafa]">{conf.profile?.nome}</span>
                                </div>
                                {conf.ordem_chegada ? (
                                  <span className="text-xs font-medium text-[#00e676]">
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

                    {/* Promoção automática notification */}
                    {promovidoInfo && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="mt-3 p-3 rounded-lg bg-[#00e676]/10 border border-[#00e676]/20 text-sm"
                      >
                        <p className="font-medium flex items-center gap-1 text-[#00e676]">
                          <ArrowUp className="h-4 w-4" />
                          <span>{promovidoInfo.nome} foi promovido da fila!</span>
                        </p>
                        <button
                          onClick={() => setPromovidoInfo(null)}
                          className="text-xs text-[#6b7280] mt-1 hover:underline"
                        >
                          Dispensar
                        </button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </FadeIn>

              {/* Sorteio */}
              {/* Waiting List Section */}
              {showFila && (
                <FadeIn delay={0.15}>
                  <div className="rounded-xl bg-[#1a1a1a] border border-[#ffab00]/20 overflow-hidden">
                    <div
                      className="flex items-center justify-between p-6 pb-4 cursor-pointer select-none"
                      onClick={() => setShowFila(!showFila)}
                    >
                      <div>
                        <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                          <ListOrdered className="h-5 w-5 text-[#ffab00]" />
                          Lista de Espera
                          {filaEspera.length > 0 && (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#ffab00]/10 text-[#ffab00] text-xs font-bold">
                              {filaEspera.length}
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-[#6b7280]">
                          {filaEspera.length > 0
                            ? `${filaEspera.length} jogador${filaEspera.length > 1 ? "es" : ""} aguardando vaga`
                            : "Nenhum jogador na fila"}
                        </p>
                      </div>
                      {showFila ? (
                        <ChevronUp className="h-4 w-4 text-[#6b7280]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[#6b7280]" />
                      )}
                    </div>

                    <AnimatePresence>
                      {showFila && (
                        <div className="px-6 pb-6 space-y-3">
                          {filaEspera.length === 0 ? (
                            <div className="text-center py-6">
                              <ListOrdered className="h-8 w-8 text-[#6b7280]/50 mx-auto mb-2" />
                              <p className="text-xs text-[#6b7280]">
                                Fila vazia. Quando a pelada lotar,
                                os diaristas excedentes entram aqui.
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Minha posição na fila */}
                              {!isAdmin && minhaPosicaoFila > 0 && (
                                <motion.div
                                  initial={{ scale: 0.95, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ type: "spring" }}
                                  className="p-4 rounded-lg bg-gradient-to-br from-[#ffab00]/5 to-[#ffab00]/10 border border-[#ffab00]/20 text-center"
                                >
                                  <p className="text-xs text-[#ffab00]/80 mb-2">
                                    Sua posição na fila
                                  </p>
                                  <motion.div
                                    animate={{
                                      scale: [1, 1.1, 1],
                                    }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#ffab00]/10 text-[#ffab00] text-2xl font-bold mb-2"
                                  >
                                    {minhaPosicaoFila}º
                                  </motion.div>
                                  <p className="text-xs text-[#6b7280]">
                                    {minhaPosicaoFila === 1
                                      ? "🔥 Você é o próximo! Quando alguém desistir, entra automaticamente."
                                      : `${minhaPosicaoFila} pessoas na sua frente.`}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 h-7 text-xs text-[#ff5252] hover:text-[#ff5252]"
                                    onClick={handleSairDaFila}
                                  >
                                    Sair da fila
                                  </Button>
                                </motion.div>
                              )}

                              {/* Fila progress bar */}
                              <div className="w-full h-1.5 rounded-full bg-[#2a2a2a] overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{
                                    width: `${Math.min((filaEspera.length / 10) * 100, 100)}%`,
                                  }}
                                  className="h-full rounded-full bg-[#ffab00]"
                                />
                              </div>

                              {/* Lista da fila */}
                              <div className="space-y-1">
                                {filaEspera.map((item) => (
                                  <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#121212] border border-[#2a2a2a] hover:border-[#ffab00]/20 transition-all duration-200 group"
                                  >
                                    <div className="flex items-center gap-2">
                                      <motion.span
                                        whileHover={{ scale: 1.2 }}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                          item.posicao === 1
                                            ? "bg-[#ffab00] text-[#0a0a0a]"
                                            : item.posicao <= 3
                                            ? "bg-[#ffab00]/10 text-[#ffab00]"
                                            : "bg-[#2a2a2a] text-[#6b7280]"
                                        }`}
                                      >
                                        {item.posicao}
                                      </motion.span>
                                      {item.profile?.avatar_url ? (
                                        <Avatar className="h-7 w-7">
                                          <AvatarImage src={item.profile.avatar_url} />
                                        </Avatar>
                                      ) : (
                                        <AvatarPlaceholder name={item.profile?.nome} size="sm" />
                                      )}
                                      <span className="text-xs font-medium text-[#fafafa]">
                                        {item.profile?.nome}
                                      </span>
                                      {item.prioridade === "mensalista" && (
                                        <BadgeStatus type="mensalista" />
                                      )}
                                    </div>

                                    {/* Admin actions */}
                                    {isAdmin && (
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() =>
                                            handlePromoverDaFila(item.user_id)
                                          }
                                          title="Promover da fila"
                                        >
                                          <UserPlus className="h-3.5 w-3.5 text-[#00e676]" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() =>
                                            handleRemoverDaFila(item.user_id)
                                          }
                                          title="Remover da fila"
                                        >
                                          <XCircle className="h-3.5 w-3.5 text-[#ff5252]" />
                                        </Button>
                                      </div>
                                    )}
                                  </motion.div>
                                ))}
                              </div>

                              {/* Summary */}
                              <div className="flex items-center justify-between text-xs text-[#6b7280] pt-2 border-t border-[#2a2a2a]">
                                <span>
                                  {filaEspera.length} jogador{filaEspera.length > 1 ? "es" : ""} na fila
                                </span>
                                <span>
                                  Limite: {participantes.length}/{pelada.limite_jogadores}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </FadeIn>
              )}

              {/* Sorteio */}
              <FadeIn delay={0.2}>
                <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                  <div className="p-6 pb-4">
                    <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                      <Shuffle className="h-5 w-5 text-[#00e676]" />
                      Sorteio de Times
                    </h3>
                  </div>
                  <div className="px-6 pb-6 space-y-4">
                    <p className="text-sm text-[#6b7280]">
                      {isAdmin
                        ? "Clique abaixo para realizar o sorteio dos times com os jogadores confirmados."
                        : "O admin irá realizar o sorteio dos times."}
                    </p>

                    {isAdmin && (
                      <Link href={`/pelada/sorteio/${pelada.id}`}>
                        <Button variant="glow" className="w-full">
                          <Shuffle className="mr-2 h-4 w-4" />
                          Realizar Sorteio
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </FadeIn>

              {/* Ao Vivo */}
              <FadeIn delay={0.25}>
                <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                  <div className="p-6 pb-4">
                    <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                      <Swords className="h-5 w-5 text-[#00e676]" />
                      Confrontos ao Vivo
                    </h3>
                  </div>
                  <div className="px-6 pb-6 space-y-4">
                    <p className="text-sm text-[#6b7280]">
                      Acompanhe os confrontos entre os times sorteados, marque gols e veja quem leva a melhor.
                    </p>
                    <Link href={`/pelada/${pelada.id}/ao-vivo`}>
                      <Button variant="glow" className="w-full">
                        <Swords className="mr-2 h-4 w-4" />
                        Ir para Ao Vivo
                      </Button>
                    </Link>
                  </div>
                </div>
              </FadeIn>

              {/* Info */}
              <FadeIn delay={0.3}>
                <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                  <div className="p-6 pb-4">
                    <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-[#00e676]" />
                      Detalhes
                    </h3>
                  </div>
                  <div className="px-6 pb-6 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Criada em</span>
                      <span className="text-[#fafafa]">
                        {new Date(pelada.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Times</span>
                      <span className="text-[#fafafa]">{pelada.numero_times}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Jog/Time</span>
                      <span className="text-[#fafafa]">{pelada.jogadores_por_time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Vagas</span>
                      <span className="text-[#fafafa]">
                        {participantes.length}/{pelada.limite_jogadores}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Link</span>
                      <button
                        onClick={handleCopyLink}
                        className="text-[#00e676] hover:underline"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  )
}
