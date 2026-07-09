"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/layout/motion-wrapper"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import {
  Calendar,
  Users,
  Shuffle,
  Trophy,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"

const features = [
  {
    icon: Calendar,
    title: "Organize Peladas",
    description: "Crie peladas com data, local e limites personalizados em segundos.",
  },
  {
    icon: Users,
    title: "Gerencie Jogadores",
    description: "Controle mensalistas, diaristas e lista de espera automaticamente.",
  },
  {
    icon: Shuffle,
    title: "Sorteio Inteligente",
    description: "Sorteios equilibrados com modos personalizáveis e animados.",
  },
  {
    icon: Trophy,
    title: "Ranking e Histórico",
    description: "Acompanhe o histórico de jogos e resultados das peladas.",
  },
]

const steps = [
  "Crie sua conta gratuita",
  "Crie ou entre em uma pelada",
  "Confirme presença no dia",
  "Participe do sorteio dos times",
]

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <Logo size="sm" />
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/auth/login">
                <Button variant="ghost">Entrar</Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="glow" size="sm">
                  Cadastrar
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,230,118,0.08)_0%,transparent_60%)]" />

        {/* Decorative circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00e676]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00e676]/5 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
              className="text-7xl mb-6"
            >
              ⚽
            </motion.div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-[#fafafa]">
              Organize suas{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                Peladas
              </span>{" "}
              com Facilidade
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-lg sm:text-xl text-[#6b7280] max-w-2xl mx-auto mb-8">
              Crie peladas, convide amigos, confirme presença e sorteie times
              equilibrados — tudo em um só lugar, de graça.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/register">
                <Button size="xl" variant="glow">
                  Começar Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="xl" variant="outline">
                  Já tenho conta
                </Button>
              </Link>
            </div>
          </FadeIn>

          {/* Steps */}
          <FadeIn delay={0.4}>
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]"
                >
                  <div className="w-8 h-8 rounded-full bg-[#00e676] text-[#0a0a0a] flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </div>
                  <p className="text-sm text-center text-[#6b7280]">{step}</p>
                </motion.div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-[#fafafa]">
              Tudo que você precisa
            </h2>
            <p className="text-[#6b7280] text-center mb-12 max-w-2xl mx-auto">
              Ferramentas completas para organizar peladas de futebol como um profissional
            </p>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <StaggerItem key={i}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="p-6 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00e676]/20 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-lg bg-[#00e676]/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-[#00e676]" />
                  </div>
                  <h3 className="font-semibold mb-2 text-[#fafafa]">{feature.title}</h3>
                  <p className="text-sm text-[#6b7280]">
                    {feature.description}
                  </p>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#121212]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <FadeIn>
            <div className="p-12 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#121212] border border-[#00e676]/20">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] mb-4">
                Pronto para Organizar sua Pelada?
              </h2>
              <p className="text-[#6b7280] mb-8 max-w-xl mx-auto">
                Junte-se a centenas de jogadores que já usam o PeladaPro para
                organizar suas partidas.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/auth/register">
                  <Button size="lg" variant="glow">
                    Criar Conta Gratuita
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-[#6b7280]">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-[#00e676]" /> Sem cartão de crédito
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-[#00e676]" /> 100% gratuito
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-[#00e676]" /> Deploy na Vercel
                </span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2a2a2a] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-[#6b7280]">
          <p>© {new Date().getFullYear()} PeladaPro. Feito com ⚽ para os amantes do futebol.</p>
        </div>
      </footer>
    </div>
  )
}
