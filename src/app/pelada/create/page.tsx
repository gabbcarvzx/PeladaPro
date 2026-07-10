"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { PeladaService } from "@/services/pelada-service"
import { PermissionService } from "@/services/permission-service"
import { PELADA_LIMITES } from "@/utils/constants"
import {
  ArrowLeft,
  Loader2,
  Calendar,
  MapPin,
  Users,
  Shuffle,
  FileText,
  Trophy,
  Repeat,
  Clock,
  Sparkles,
  MessageCircle,
  ArrowRight,
} from "lucide-react"

export default function CreatePeladaPage() {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const peladaService = new PeladaService(supabase)

  const [nome, setNome] = useState("")
  const [descricao, setDescricao] = useState("")
  const [local, setLocal] = useState("")
  const [data, setData] = useState("")
  const [limiteJogadores, setLimiteJogadores] = useState("20")
  const [limitePorOcorrencia, setLimitePorOcorrencia] = useState("25")
  const [numeroTimes, setNumeroTimes] = useState("2")
  const [jogadoresPorTime, setJogadoresPorTime] = useState("5")
  const [recorrente, setRecorrente] = useState(false)
  const [diaSemana, setDiaSemana] = useState("4")
  const [horario, setHorario] = useState("20:00")
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState<string>("")
  const [checkingAccess, setCheckingAccess] = useState(true)

  const DIAS_SEMANA = [
    { value: "0", label: "Domingo" },
    { value: "1", label: "Segunda-feira" },
    { value: "2", label: "Terça-feira" },
    { value: "3", label: "Quarta-feira" },
    { value: "4", label: "Quinta-feira" },
    { value: "5", label: "Sexta-feira" },
    { value: "6", label: "Sábado" },
  ]

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    router.push("/auth/login")
    return null
  }

  useEffect(() => {
    if (!user) return
    const permissionService = new PermissionService(supabase)
    permissionService.isAdmin(user.id).then((isAdmin) => {
      setUserRole(isAdmin ? "admin" : "user")
      setCheckingAccess(false)
    })
  }, [user])

  // Se não é admin, mostra tela profissional com WhatsApp
  if (!checkingAccess && userRole !== "admin") {
    return (
      <div className="min-h-screen bg-muted/20">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
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
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <PageTransition>
            <FadeIn>
              <Card className="text-center border-[#00e676]/20">
                <CardHeader>
                  <div className="relative mx-auto w-16 h-16 mb-4">
                    <motion.div
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      className="w-16 h-16 rounded-2xl bg-[#00e676]/10 flex items-center justify-center"
                    >
                      <MessageCircle className="h-8 w-8 text-[#00e676]" />
                    </motion.div>
                  </div>
                  <CardTitle className="text-2xl text-[#fafafa]">
                    Criação de Pelada é exclusiva para administradores
                  </CardTitle>
                  <CardDescription className="text-base">
                    Desbloqueie o controle total da sua pelada. Com o plano administrador,
                    você pode criar times, gerenciar jogadores e muito mais.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { icon: Trophy, title: "Controle total", desc: "Crie e gerencie sua pelada do seu jeito" },
                      { icon: Users, title: "Lista de espera", desc: "Gestão automática de fila e prioridades" },
                      { icon: Shuffle, title: "Sorteio ao vivo", desc: "Times equilibrados e confrontos dinâmicos" },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#121212] border border-[#2a2a2a] text-center"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                          <item.icon className="h-5 w-5 text-[#00e676]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#fafafa]">{item.title}</p>
                          <p className="text-xs text-[#6b7280]">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <a
                    href={`https://wa.me/5581992796870?text=${encodeURIComponent("Olá! Quero ativar o plano administrador do PeladaPro para criar e gerenciar minha pelada.")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <Button
                      variant="glow"
                      size="lg"
                      className="w-full h-12 text-base relative overflow-hidden"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <MessageCircle className="h-5 w-5 group-hover:scale-110 transition-transform" />
                        Ativar Plano Administrador
                      </span>
                    </Button>
                  </a>

                  <p className="text-xs text-[#6b7280] text-center flex items-center justify-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
                    Atendimento rápido em horário comercial
                  </p>

                  <div className="border-t border-[#2a2a2a] pt-6">
                    <Link href="/dashboard">
                      <Button variant="outline" size="lg" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                      </Button>
                    </Link>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Participar de peladas por convite é gratuito para todos os usuários.
                    A criação de peladas é exclusiva para administradores.
                  </p>
                </CardContent>
              </Card>
            </FadeIn>
          </PageTransition>
        </main>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSaving(true)

    try {
      const pelada = await peladaService.create({
        nome,
        descricao: descricao || undefined,
        local: local || undefined,
        data: recorrente ? undefined : data || undefined,
        limite_jogadores: parseInt(limiteJogadores),
        limite_por_ocorrencia: parseInt(limitePorOcorrencia),
        numero_times: parseInt(numeroTimes),
        jogadores_por_time: parseInt(jogadoresPorTime),
        admin_id: user.id,
        recorrente,
        dia_semana: recorrente ? parseInt(diaSemana) : null,
        horario: recorrente ? horario : null,
      })

      if (pelada) {
        toast({
          title: "Pelada criada! 🎉",
          description: `"${pelada.nome}" foi criada com sucesso. Compartilhe o link de convite!`,
          variant: "success",
        })
        router.push(`/pelada/${pelada.id}`)
      } else {
        throw new Error("Erro ao criar pelada")
      }
    } catch (error) {
      toast({
        title: "Erro ao criar pelada",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const totalJogadores = parseInt(limiteJogadores)
  const vagasPorData = parseInt(limitePorOcorrencia)
  const totalTimes = parseInt(numeroTimes)
  const porTime = parseInt(jogadoresPorTime)
  const capacidadeTimes = totalTimes * porTime
  const capacidadeOk = capacidadeTimes <= totalJogadores

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-primary" />
                  Criar Nova Pelada
                </CardTitle>
                <CardDescription>
                  Configure os detalhes da sua pelada. Você poderá convidar jogadores depois.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Nome */}
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome da Pelada *</Label>
                    <div className="relative">
                      <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className="pl-10"
                        placeholder="Ex: Pelada do Sábado"
                        required
                      />
                    </div>
                  </div>

                  {/* Descrição */}
                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <textarea
                        id="descricao"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        className="flex min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 pl-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                        placeholder="Informações adicionais sobre a pelada..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Local */}
                    <div className="space-y-2">
                      <Label htmlFor="local">Local</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="local"
                          value={local}
                          onChange={(e) => setLocal(e.target.value)}
                          className="pl-10"
                          placeholder="Onde vai ser?"
                        />
                      </div>
                    </div>

                    {/* Data */}
                    {!recorrente && (
                      <div className="space-y-2">
                        <Label htmlFor="data">Data do jogo</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="data"
                            type="datetime-local"
                            value={data}
                            onChange={(e) => setData(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    )}

                    {/* Recorrente: Dia da Semana */}
                    {recorrente && (
                      <div className="space-y-2">
                        <Label>Dia da Semana</Label>
                        <Select value={diaSemana} onValueChange={setDiaSemana}>
                          <SelectTrigger>
                            <Calendar className="mr-2 h-4 w-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIAS_SEMANA.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Recorrente: Horário */}
                    {recorrente && (
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="time"
                            value={horario}
                            onChange={(e) => setHorario(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recorrência Toggle */}
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-[#2a2a2a] bg-[#121212]">
                    <button
                      type="button"
                      onClick={() => setRecorrente(!recorrente)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        recorrente ? "bg-[#00e676]" : "bg-[#2a2a2a]"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          recorrente ? "translate-x-6" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <label className="text-sm font-medium text-[#fafafa] flex items-center gap-2 cursor-pointer" onClick={() => setRecorrente(!recorrente)}>
                        <Repeat className="h-4 w-4" />
                        Pelada recorrente semanal
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {recorrente
                          ? `Acontece toda ${DIAS_SEMANA.find((d) => d.value === diaSemana)?.label} às ${horario}`
                          : "Ative para criar uma pelada que se repete toda semana"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-6">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Configuração dos Times
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Limite de participantes */}
                      <div className="space-y-2">
                        <Label>Limite de participantes</Label>
                        <Select
                          value={limiteJogadores}
                          onValueChange={setLimiteJogadores}
                        >
                          <SelectTrigger>
                            <Users className="mr-2 h-4 w-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              { length: PELADA_LIMITES.MAX_JOGADORES - PELADA_LIMITES.MIN_JOGADORES + 1 },
                              (_, i) => i + PELADA_LIMITES.MIN_JOGADORES,
                            ).map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n} participantes
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Número de times */}
                      <div className="space-y-2">
                        <Label>Número de times</Label>
                        <Select
                          value={numeroTimes}
                          onValueChange={setNumeroTimes}
                        >
                          <SelectTrigger>
                            <Shuffle className="mr-2 h-4 w-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              { length: PELADA_LIMITES.MAX_TIMES - PELADA_LIMITES.MIN_TIMES + 1 },
                              (_, i) => i + PELADA_LIMITES.MIN_TIMES,
                            ).map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n} times
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Jogadores por time */}
                      <div className="space-y-2">
                        <Label>Jogadores por time</Label>
                        <Select
                          value={jogadoresPorTime}
                          onValueChange={setJogadoresPorTime}
                        >
                          <SelectTrigger>
                            <Users className="mr-2 h-4 w-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              { length: PELADA_LIMITES.MAX_JOGADORES_POR_TIME - PELADA_LIMITES.MIN_JOGADORES_POR_TIME + 1 },
                              (_, i) => i + PELADA_LIMITES.MIN_JOGADORES_POR_TIME,
                            ).map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n} por time
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Limite por ocorrência */}
                      <div className="space-y-2">
                        <Label>Limite por data</Label>
                        <Select
                          value={limitePorOcorrencia}
                          onValueChange={setLimitePorOcorrencia}
                        >
                          <SelectTrigger>
                            <Calendar className="mr-2 h-4 w-4" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[15, 20, 22, 24, 25, 26, 28, 30, 35, 40].map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n} por data
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Máximo de confirmados por ocorrência (diaristas). Mensalistas sempre entram.
                        </p>
                      </div>
                    </div>

                    {/* Resumo */}
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-4 p-4 rounded-lg ${
                        capacidadeOk
                          ? "bg-[#00e676]/5 border border-[#00e676]/20"
                          : "bg-[#ff5252]/5 border border-[#ff5252]/20"
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {totalTimes} times × {porTime} jogadores =
                        </span>
                        <span
                          className={`font-semibold ${
                            capacidadeOk ? "text-[#00e676]" : "text-[#ff5252]"
                          }`}
                        >
                          {capacidadeTimes} vagas · {totalJogadores} participantes · {vagasPorData} por data
                        </span>
                      </div>
                      {!capacidadeOk && (
                        <p className="text-xs text-[#ff5252] mt-1">
                          A capacidade dos times ({capacidadeTimes}) excede o limite de
                          jogadores ({totalJogadores}). Ajuste os valores.
                        </p>
                      )}
                    </motion.div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      variant="gradient"
                      size="lg"
                      disabled={saving || !capacidadeOk}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Trophy className="mr-2 h-5 w-5" />
                      )}
                      Criar Pelada
                    </Button>
                    <Link href="/dashboard">
                      <Button type="button" variant="outline" size="lg">
                        Cancelar
                      </Button>
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </FadeIn>
        </PageTransition>
      </main>
    </div>
  )
}
