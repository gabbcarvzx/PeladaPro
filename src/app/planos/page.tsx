"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { SubscriptionService } from "@/services/subscription-service"
import {
  Loader2,
  CheckCircle2,
  Shield,
  Users,
  Shuffle,
  Swords,
  Zap,
  Star,
  ArrowLeft,
  Sparkles,
  CreditCard,
  Calendar,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react"
import { PreCheckoutModal } from "@/components/checkout/pre-checkout-modal"

export default function PlanosPage() {
  const router = useRouter()
  const { supabase, user, profile, loading: authLoading } = useSupabase()
  const subscriptionService = new SubscriptionService(supabase)
  const [subStatus, setSubStatus] = useState<string>("none")
  const [loadingSub, setLoadingSub] = useState(true)
  const [showPreCheckout, setShowPreCheckout] = useState(false)
  const [subDetails, setSubDetails] = useState<{
    status: string
    expiresAt: string | null
    graceUntil: string | null
    lastPaymentAt: string | null
    planPrice: number
    diasRestantes: number
  } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?redirect=/planos")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    loadSubscription()
  }, [user])

  const loadSubscription = async () => {
    const details = await subscriptionService.getSubscriptionDetails(user!.id)
    setSubDetails(details)
    setSubStatus(details.status)
    setLoadingSub(false)
  }

  const handleAssinar = () => {
    if (!user) return
    // Abre o modal de pré-checkout para coletar CPF/CNPJ
    setShowPreCheckout(true)
  }

  // Com o fluxo simplificado (expires_at), o usuario esta ativo se status = active e tem dias restantes
  const diasRestantes = subDetails ? subDetails.diasRestantes : 0
  const isActive = subStatus === "active" && diasRestantes > 0
  const isExpired = subStatus === "active" && diasRestantes <= 0

  if (authLoading || loadingSub) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00e676]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
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
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          {/* Header */}
          <FadeIn>
            <div className="text-center mb-12">
              <motion.div
                animate={{ rotate: [0, -5, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-5xl mb-4"
              >
                ⚡
              </motion.div>
              <h1 className="text-4xl font-bold mb-3">
                Seu clube, <span className="bg-gradient-brand bg-clip-text text-transparent">profissional</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Desbloqueie todas as ferramentas de administração para gerenciar suas peladas como um profissional.
              </p>
            </div>
          </FadeIn>

          {/* Status Atual — Card Detalhado */}
          {(isActive || isExpired || subStatus === "pending" || subStatus === "canceled") && subDetails && (
            <FadeIn delay={0.1}>
              <div className={`max-w-lg mx-auto mb-8 p-6 rounded-2xl border ${
                isActive
                  ? "bg-[#00e676]/5 border-[#00e676]/20"
                  : isExpired
                  ? "bg-[#ff5252]/5 border-[#ff5252]/20"
                  : subStatus === "pending"
                  ? "bg-[#ffab00]/5 border-[#ffab00]/20"
                  : "bg-[#ff5252]/5 border-[#ff5252]/20"
              }`}>
                <div className="text-center mb-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 ${
                      isActive
                        ? "bg-[#00e676]/10"
                        : subStatus === "pending"
                        ? "bg-[#ffab00]/10"
                        : "bg-[#ff5252]/10"
                    }`}
                  >
                    {isActive ? (
                      <CheckCircle2 className="h-8 w-8 text-[#00e676]" />
                    ) : subStatus === "pending" ? (
                      <Clock className="h-8 w-8 text-[#ffab00]" />
                    ) : (
                      <XCircle className="h-8 w-8 text-[#ff5252]" />
                    )}
                  </motion.div>
                  <h2 className={`text-xl font-bold mb-1 ${
                    isActive ? "text-[#fafafa]" : "text-[#ffab00]"
                  }`}>
                    {isActive && `Assinatura Ativa 🎉`}
                    {isExpired && "Assinatura Expirada ❌"}
                    {subStatus === "pending" && "Pagamento Pendente ⏳"}
                    {subStatus === "canceled" && "Assinatura Cancelada"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isActive && diasRestantes > 0
                      ? `Expira em ${diasRestantes} dia${diasRestantes > 1 ? "s" : ""}`
                      : isExpired
                      ? "Sua assinatura expirou. Faça um novo pagamento para reativar."
                      : subStatus === "pending"
                      ? "Aguardando confirmação do pagamento..."
                      : "Assinatura cancelada."}
                  </p>
                </div>

                {/* Detalhes */}
                <div className="space-y-3">
                  {/* Vigente até */}
                  {subDetails.expiresAt && isActive && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#121212] border border-[#2a2a2a]">
                      <span className="flex items-center gap-2 text-sm text-[#6b7280]">
                        <Calendar className="h-4 w-4" />
                        Vigente até
                      </span>
                      <span className="text-sm font-medium text-[#fafafa]">
                        {SubscriptionService.formatarData(subDetails.expiresAt)}
                      </span>
                    </div>
                  )}

                  {/* Próxima renovação */}
                  {isActive && subDetails.expiresAt && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#121212] border border-[#2a2a2a]">
                      <span className="flex items-center gap-2 text-sm text-[#6b7280]">
                        <RefreshCw className="h-4 w-4" />
                        Renovar em
                      </span>
                      <span className="text-sm font-medium text-[#fafafa]">
                        {SubscriptionService.formatarData(subDetails.expiresAt)}
                      </span>
                    </div>
                  )}

                  {/* Último pagamento */}
                  {subDetails.lastPaymentAt && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#121212] border border-[#2a2a2a]">
                      <span className="flex items-center gap-2 text-sm text-[#6b7280]">
                        <CheckCircle2 className="h-4 w-4 text-[#00e676]" />
                        Último pagamento
                      </span>
                      <span className="text-sm text-[#fafafa]">
                        {SubscriptionService.formatarData(subDetails.lastPaymentAt)}
                      </span>
                    </div>
                  )}

                  {/* Preço */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#121212] border border-[#2a2a2a]">
                    <span className="flex items-center gap-2 text-sm text-[#6b7280]">
                      <CreditCard className="h-4 w-4" />
                      Plano
                    </span>
                    <span className="text-sm font-medium text-[#fafafa]">
                      R$ {subDetails.planPrice.toFixed(2).replace(".", ",")}/mês
                    </span>
                  </div>
                </div>

                {/* Status badges */}
                {isExpired && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-[#ff5252]/80 mb-3">
                      Sua assinatura expirou. Faça um novo pagamento para reativar o acesso administrativo.
                    </p>
                    <Link href="/planos">
                      <Button variant="glow" size="sm">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Reativar assinatura
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </FadeIn>
          )}

          {/* Nenhuma assinatura */}
          {subStatus === "none" && (
            <FadeIn delay={0.1}>
              <div className="max-w-lg mx-auto mb-8 p-6 rounded-2xl bg-[#121212] border border-[#2a2a2a] text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#2a2a2a] mb-3">
                  <CreditCard className="h-8 w-8 text-[#6b7280]" />
                </div>
                <h2 className="text-xl font-bold text-[#fafafa] mb-1">Sem assinatura</h2>
                <p className="text-sm text-muted-foreground">
                  Você ainda não possui uma assinatura. Assine abaixo para desbloquear todas as funcionalidades de administração.
                </p>
              </div>
            </FadeIn>
          )}

          {/* Planos */}
          <FadeIn delay={0.2}>
            <div className="max-w-lg mx-auto">
              <Card className="relative border-[#00e676]/20 overflow-hidden">
                {/* Popular Badge */}
                <div className="absolute top-0 right-0">
                  <div className="bg-[#00e676] text-[#0a0a0a] text-xs font-bold px-4 py-1 rounded-bl-xl">
                    MAIS POPULAR
                  </div>
                </div>

                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">Plano Mensal</CardTitle>
                  <CardDescription>
                    Tudo que você precisa para administrar suas peladas
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Preço */}
                  <div className="text-center">
                    <span className="text-5xl font-bold text-[#fafafa]">R$ 30</span>
                    <span className="text-lg text-muted-foreground">/mês</span>
                  </div>

                  {/* Benefícios */}
                  <div className="space-y-3">
                    {[
                      { icon: Shield, text: "Criar e administrar peladas ilimitadas" },
                      { icon: Users, text: "Gerenciar lista de espera e prioridade" },
                      { icon: Shuffle, text: "Sorteio inteligente de times" },
                      { icon: Swords, text: "Confrontos ao vivo com placar" },
                      { icon: Zap, text: "Gols, assistências e estatísticas" },
                      { icon: Star, text: "Suporte prioritário" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-[#00e676]/10 flex items-center justify-center shrink-0">
                          <item.icon className="h-4 w-4 text-[#00e676]" />
                        </div>
                        <span className="text-[#fafafa]">{item.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  {isActive ? (
                    <Button variant="outline" size="lg" className="w-full h-12" disabled>
                      <CheckCircle2 className="mr-2 h-5 w-5 text-[#00e676]" />
                      Assinatura Ativa
                    </Button>
                  ) : (
                    <Button
                      onClick={handleAssinar}
                      variant="glow"
                      size="lg"
                      className="w-full h-12 text-base"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      Assinar por R$ 30/mês
                    </Button>
                  )}

                  <p className="text-xs text-center text-muted-foreground">
                    Pagamento via PIX, boleto ou cartão de crédito. Cancele quando quiser.
                    <br />
                    Após a confirmação do pagamento, sua assinatura é ativada automaticamente.
                  </p>
                </CardContent>
              </Card>

              {/* Grátis Info */}
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 inline mr-1 text-[#00e676]" />
                  Participar de peladas por convite é e sempre será <strong className="text-[#fafafa]">gratuito</strong>.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  A assinatura é necessária apenas para <strong>criar e administrar</strong> peladas.
                </p>
              </div>
            </div>
          </FadeIn>
        </PageTransition>
      </main>

      {/* Pré-checkout Modal */}
      <PreCheckoutModal
        open={showPreCheckout}
        onClose={() => setShowPreCheckout(false)}
        userEmail={user?.email || ""}
        userName={profile?.nome || ""}
      />
    </div>
  )
}
