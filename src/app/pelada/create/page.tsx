"use client"

import { useState } from "react"
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
  const [numeroTimes, setNumeroTimes] = useState("2")
  const [jogadoresPorTime, setJogadoresPorTime] = useState("5")
  const [saving, setSaving] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSaving(true)

    try {
      const pelada = await peladaService.create({
        nome,
        descricao: descricao || undefined,
        local: local || undefined,
        data: data || undefined,
        limite_jogadores: parseInt(limiteJogadores),
        numero_times: parseInt(numeroTimes),
        jogadores_por_time: parseInt(jogadoresPorTime),
        admin_id: user.id,
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
  const totalTimes = parseInt(numeroTimes)
  const porTime = parseInt(jogadoresPorTime)
  const capacidadeTimes = totalTimes * porTime
  const capacidadeOk = capacidadeTimes <= totalJogadores

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
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
                  </div>

                  <div className="border-t border-border pt-6">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Configuração dos Times
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Limite de jogadores */}
                      <div className="space-y-2">
                        <Label>Limite de jogadores</Label>
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
                                {n} jogadores
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
                          {capacidadeTimes} vagas em {totalJogadores} jogadores
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
