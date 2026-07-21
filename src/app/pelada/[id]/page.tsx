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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  UserMinus,
  Settings2,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  UserPlus,
  ArrowUp,
  Swords,
  Repeat,
  Plus,
  Pencil,
  Zap,
  Trophy,
  Sparkles,
} from "lucide-react"
import type { Pelada, PeladaOcorrencia, PeladaParticipante, ConfirmacaoDia, ListaEspera } from "@/types"
import { BadgeStatus } from "@/components/ui/badge-status"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

  // Modais de gerenciamento de jogadores
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTarget, setEditTarget] = useState<PeladaParticipante | null>(null)
  const [removeTarget, setRemoveTarget] = useState<PeladaParticipante | null>(null)
  const [addNome, setAddNome] = useState("")
  const [addTipo, setAddTipo] = useState("diarista")
  const [editNome, setEditNome] = useState("")
  const [savingAdd, setSavingAdd] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [removing, setRemoving] = useState(false)

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

  const handleOpenRemoveModal = (userId: string) => {
    const target = participantes.find((p) => p.user_id === userId)
    if (target) {
      setRemoveTarget(target)
      setShowRemoveModal(true)
    }
  }

  const handleConfirmRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const res = await fetch("/api/admin/jogadores", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peladaId, userId: removeTarget.user_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao remover")
      setParticipantes((prev) => prev.filter((p) => p.user_id !== removeTarget.user_id))
      toast({ title: "Jogador removido", variant: "success" })
      setShowRemoveModal(false)
      setRemoveTarget(null)
    } catch (err) {
      toast({ title: "Erro ao remover", description: err instanceof Error ? err.message : "Erro", variant: "destructive" })
    } finally {
      setRemoving(false)
    }
  }

  const handleOpenEditModal = (participante: PeladaParticipante) => {
    setEditTarget(participante)
    setEditNome(participante.profile?.nome || "")
    setShowEditModal(true)
  }

  const handleConfirmEdit = async () => {
    if (!editTarget || !editNome.trim()) return
    setSavingEdit(true)
    try {
      const res = await fetch("/api/admin/jogadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peladaId, userId: editTarget.user_id, nome: editNome.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao editar")
      setParticipantes((prev) =>
        prev.map((p) =>
          p.user_id === editTarget.user_id
            ? { ...p, profile: { ...p.profile, nome: editNome.trim() } as any }
            : p,
        ),
      )
      toast({ title: "Nome atualizado!", variant: "success" })
      setShowEditModal(false)
      setEditTarget(null)
    } catch (err) {
      toast({ title: "Erro ao editar", description: err instanceof Error ? err.message : "Erro", variant: "destructive" })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleAddJogador = async () => {
    if (!addNome.trim()) return
    setSavingAdd(true)
    try {
      const res = await fetch("/api/admin/jogadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peladaId,
          nome: addNome.trim(),
          tipo: addTipo,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar")
      // Recarrega participantes
      const parts = await peladaService.getParticipantes(peladaId)
      setParticipantes(parts)
      toast({ title: "Jogador adicionado!", description: `${addNome.trim()} entrou na pelada.`, variant: "success" })
      setShowAddModal(false)
      setAddNome("")
      setAddTipo("diarista")
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao adicionar", variant: "destructive" })
    } finally {
      setSavingAdd(false)
    }
  }

  const handleAlterarTipo = async (userId: string, tipo: string) => {
    await peladaService.alterarTipoJogador(peladaId, userId, tipo)
    setParticipantes((prev) =>
      prev.map((p) =>
        p.user_id === userId ? { ...p, tipo: tipo as "mensalista" | "diarista" } : p,
      ),
    )
    toast({ title: "Tipo alterado", variant: "success" })
  }

  const handleDeletePelada = async () => {
    if (!confirm("Tem certeza? Esta ação não pode ser desfeita.")) return
    await peladaService.delete(peladaId)
    toast({ title: "Pelada excluída" })
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
    await peladaService.confirmarIntencao(peladaId, user.id, confirmingDate, ocorrenciaAtual?.id)
    toast({ title: "Intenção registrada!", description: "Você marcou que vai jogar. O admin confirmará sua chegada no local.", variant: "success" })
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

  const handleConfirmarChegada = async (userId: string) => {
    if (!confirmingDate) return
    const result = await peladaService.confirmarChegada(peladaId, userId, confirmingDate, ocorrenciaAtual?.id)
    if (result.status === "fila") {
      toast({
        title: "Pelada lotada!",
        description: "Jogador foi para a fila de espera (limite de 25 atingido).",
        variant: "default",
      })
    } else {
      toast({ title: `Chegada confirmada! Ordem: ${result.ordem_chegada}º`, variant: "success" })
    }
    await loadConfirmacoes()
    await loadFilaEspera()
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
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-4">
        <Tabs value="info" onValueChange={(value) => {
          if (value === "times") router.push(`/pelada/${peladaId}/times`)
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
                      {participantes.length} participantes
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
                      width: `${Math.min((confirmadosCount / (pelada.limite_por_ocorrencia || 25)) * 100, 100)}%`,
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
                  <div className="flex items-center justify-between p-6 pb-4">
                    <div
                      className="flex items-center gap-3 cursor-pointer select-none"
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
                    {isAdmin && (
                      <Button
                        variant="glow"
                        size="sm"
                        onClick={() => setShowAddModal(true)}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Adicionar
                      </Button>
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
                                    <Link
                                      href={`/jogador/${participante.user_id}`}
                                      className="font-medium text-sm text-[#fafafa] hover:text-[#00e676] transition-colors duration-200"
                                    >
                                      {participante.profile?.nome || "Jogador"}
                                    </Link>
                                    {participante.user_id === pelada.admin_id && (
                                      <BadgeStatus type="admin" className="ml-1" />
                                    )}
                                    <BadgeStatus type={participante.tipo} />
                                  </div>
                                </div>

                                {/* Admin Actions */}
                                {isAdmin &&
                                  participante.user_id !== pelada.admin_id && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() =>
                                          handleOpenEditModal(participante)
                                        }
                                        title="Editar nome"
                                      >
                                        <Pencil className="h-3.5 w-3.5 text-[#6b7280] hover:text-[#00e676] transition-colors" />
                                      </Button>
                                      <Select
                                        value={participante.tipo}
                                        onValueChange={(v) =>
                                          handleAlterarTipo(
                                            participante.user_id,
                                            v,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-20 text-xs bg-[#1a1a1a] border-[#2a2a2a]">
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
                                          handleOpenRemoveModal(
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
                              description="Adicione jogadores manualmente no painel de administração."
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
                          <span className="font-semibold text-[#00e676]">
                            {confirmadosCount}/{pelada.limite_por_ocorrencia || 25}
                          </span>
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
                    {isAdmin && showConfirmacoes && (
                      <div className="border-t border-[#2a2a2a] pt-4 mt-2">
                        <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-3">
                          Confirmar Chegada (define prioridade)
                        </p>
                        <div className="space-y-2">
                          {confirmacoes
                            .filter((c) => c.status === "pendente" || c.status === "confirmado")
                            .sort((a, b) => {
                              // Confirmados com hora_chegada primeiro, depois pendentes
                              if (a.hora_chegada && !b.hora_chegada) return -1
                              if (!a.hora_chegada && b.hora_chegada) return 1
                              return (a.ordem_chegada || 999) - (b.ordem_chegada || 999)
                            })
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
                                  {conf.hora_chegada && (
                                    <span className="text-[10px] text-[#00e676]/60 ml-1">
                                      {new Date(conf.hora_chegada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>
                                {conf.hora_chegada ? (
                                  <span className="text-xs font-medium text-[#00e676]">
                                    {conf.ordem_chegada}º
                                  </span>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() =>
                                      handleConfirmarChegada(conf.user_id)
                                    }
                                  >
                                    Chegou
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
                                      {item.posicao === 1 && (
                                        <span className="text-[10px] text-[#ffab00]">
                                          Próximo
                                        </span>
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
                                  Vagas: {confirmadosCount}/{pelada.limite_por_ocorrencia || 25}
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

              {/* Modo Dia de Jogo */}
              {isAdmin && (
                <FadeIn delay={0.22}>
                  <div className="rounded-xl bg-gradient-to-br from-[#00e676]/5 to-[#00e676]/10 border border-[#00e676]/20">
                    <div className="p-6 pb-4">
                      <h3 className="text-base font-semibold text-[#fafafa] flex items-center gap-2">
                        <Zap className="h-5 w-5 text-[#00e676]" />
                        Modo Dia de Jogo
                      </h3>
                    </div>
                    <div className="px-6 pb-6 space-y-4">
                      <p className="text-sm text-[#6b7280]">
                        Tela otimizada para uso no local da pelada. Confirme chegadas com um toque, veja ordem e fila em tempo real.
                      </p>
                      <Link href={`/pelada/${pelada.id}/dia-de-jogo`}>
                        <Button variant="glow" className="w-full h-12 text-base font-bold">
                          <Zap className="mr-2 h-5 w-5" />
                          Abrir Modo Dia de Jogo
                        </Button>
                      </Link>
                    </div>
                  </div>
                </FadeIn>
              )}

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
                      <span className="text-[#6b7280]">Participantes</span>
                      <span className="text-[#fafafa]">
                        {participantes.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Vagas por data</span>
                      <span className="text-[#fafafa]">
                        {pelada.limite_por_ocorrencia || 25}
                      </span>
                    </div>
                    <div className="flex justify-between">                          <span className="text-[#6b7280]">Tipo</span>
                      <span className="text-[#fafafa]">
                        {pelada.recorrente ? "Recorrente" : "Avulsa"}
                      </span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </PageTransition>
      </main>

      {/* ========== MODAL ADICIONAR JOGADOR ========== */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#00e676]" />
              Adicionar Jogador
            </DialogTitle>
            <DialogDescription>
              Cadastre manualmente um novo jogador na pelada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-nome">Nome do jogador *</Label>
              <Input
                id="add-nome"
                value={addNome}
                onChange={(e) => setAddNome(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={savingAdd}
                onKeyDown={(e) => e.key === "Enter" && handleAddJogador()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-tipo">Tipo (informativo)</Label>
              <Select value={addTipo} onValueChange={setAddTipo} disabled={savingAdd}>
                <SelectTrigger id="add-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diarista">Diarista</SelectItem>
                  <SelectItem value="mensalista">Mensalista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={savingAdd}>
              Cancelar
            </Button>
            <Button variant="glow" onClick={handleAddJogador} disabled={!addNome.trim() || savingAdd}>
              {savingAdd ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== MODAL EDITAR NOME ========== */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#00e676]" />
              Editar Nome
            </DialogTitle>
            <DialogDescription>
              Altere o nome do jogador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome do jogador *</Label>
              <Input
                id="edit-nome"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={savingEdit}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmEdit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button variant="glow" onClick={handleConfirmEdit} disabled={!editNome.trim() || savingEdit}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== MODAL REMOVER JOGADOR ========== */}
      <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#ff5252]">
              <Trash2 className="h-5 w-5" />
              Remover Jogador
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{removeTarget?.profile?.nome || "este jogador"}</strong> da pelada?
              Confirmações futuras e posição na fila de espera também serão removidas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveModal(false)} disabled={removing}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={removing}
              className="bg-[#ff5252] hover:bg-[#ff5252]/80 text-white"
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
