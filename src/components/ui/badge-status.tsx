"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Crown, Zap, Clock, Users } from "lucide-react"

type BadgeType = "mensalista" | "diarista" | "fila" | "admin" | "confirmado" | "recusado" | "pendente"

interface BadgeStatusProps {
  type: BadgeType
  className?: string
  animated?: boolean
}

// Padrão WCAG AA: texto escuro sobre bg colorido para máxima legibilidade
type BadgeStyle = "solid" | "subtle"

const badgeConfig: Record<BadgeType, { label: string; classes: string; icon?: React.ReactNode; style?: BadgeStyle }> = {
  mensalista: {
    label: "Mensalista",
    classes: "bg-[#22c55e] text-[#0a0a0a] font-bold border border-[#22c55e]",
    icon: <Zap className="w-3 h-3" />,
    style: "solid",
  },
  diarista: {
    label: "Diarista",
    classes: "bg-[#9ca3af]/20 text-[#9ca3af] border border-[#9ca3af]/30",
    icon: <Users className="w-3 h-3" />,
  },
  fila: {
    label: "Na Fila",
    classes: "bg-[#f59e0b] text-[#0a0a0a] font-bold border border-[#f59e0b]",
    icon: <Clock className="w-3 h-3" />,
    style: "solid",
  },
  admin: {
    label: "Admin",
    classes: "bg-[#eab308] text-[#0a0a0a] font-bold border border-[#eab308]",
    icon: <Crown className="w-3 h-3" />,
    style: "solid",
  },
  confirmado: {
    label: "Confirmado",
    classes: "bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/25",
  },
  recusado: {
    label: "Recusado",
    classes: "bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/25",
  },
  pendente: {
    label: "Pendente",
    classes: "bg-[#9ca3af]/15 text-[#9ca3af] border border-[#9ca3af]/25",
  },
}

export function BadgeStatus({ type, className, animated }: BadgeStatusProps) {
  const config = badgeConfig[type]
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider",
        config.classes,
        className,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  )

  if (animated) {
    return (
      <motion.span
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {content}
      </motion.span>
    )
  }

  return content
}
