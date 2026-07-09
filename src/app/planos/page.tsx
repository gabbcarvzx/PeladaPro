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
import { toast } from "@/components/ui/toaster"
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
} from "lucide-react"

export default function PlanosPage() {
  const router = useRouter()
  const { supabase, user, profile, loading: authLoading } = useSupabase()
  const subscriptionService = new SubscriptionService(supabase)
  const [subStatus, setSubStatus] = useState<string>("none")
  const [graceUntil, setGraceUntil] = useState<string | null>(null)
  const [loadingSub, setLoadingSub] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

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
    const { status, graceUntil } = await subscriptionService.getUserSubscriptionStatus(user!.id)
    setSubStatus(status)
    setGraceUntil(graceUntil)
    setLoadingSub(false)
  }

  const handleAssinar = async () => {
    if (!user) return
    setCheckoutLoading(true)

    try {
      // Chama API route segura (server-side) para gerar o checkout
      const response = await fetch("/api/asaas/checkout", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao gerar checkout")
      }

      const { url } = await response.json()
      // Redireciona para o checkout Asaas
      window.location.href = url
    } catch (error) {
      toast({
        title: "Erro ao gerar checkout",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setCheckoutLoading(false)
    }
  }

  const isActive = subStatus === "active" || (subStatus === "past_due" && SubscriptionService.getDiasRestantes(graceUntil) > 0)
  const diasTolerancia = subStatus === "past_due" ? SubscriptionService.getDiasRestantes(graceUntil) : 0

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

          {/* Status Atual */}
          {isActive && (
            <FadeIn delay={0.1}>
              <div className="max-w-lg mx-auto mb-8 p-6 rounded-2xl bg-[#00e676]/5 border border-[#00e676]/20 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00e676]/10 mb-3"
                >
                  <CheckCircle2 className="h-8 w-8 text-[#00e676]" />
                </motion.div>
                <h2 className="text-xl font-bold text-[#fafafa] mb-1">Assinatura Ativa 🎉</h2>
                <p className="text-sm text-muted-foreground">
                  {diasTolerancia > 0
                    ? `Você tem ${diasTolerancia} dia(s) de tolerância. Regularize para não perder o acesso.`
                    : "Você tem acesso a todos os recursos de administração."}
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
                      disabled={checkoutLoading}
                    >
                      {checkoutLoading ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <CreditCard className="mr-2 h-5 w-5" />
                      )}
                      {checkoutLoading ? "Redirecionando..." : "Assinar por R$ 30/mês"}
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
    </div>
  )
}
