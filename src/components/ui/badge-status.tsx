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

const badgeConfig: Record<BadgeType, { label: string; classes: string; icon?: React.ReactNode }> = {
  mensalista: {
    label: "Mensalista",
    classes: "bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20",
    icon: <Zap className="w-3 h-3" />,
  },
  diarista: {
    label: "Diarista",
    classes: "bg-[#6b7280]/10 text-[#a3a3a3] border border-[#6b7280]/20",
    icon: <Users className="w-3 h-3" />,
  },
  fila: {
    label: "Na Fila",
    classes: "bg-[#ffab00]/10 text-[#ffab00] border border-[#ffab00]/20",
    icon: <Clock className="w-3 h-3" />,
  },
  admin: {
    label: "Admin",
    classes: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
    icon: <Crown className="w-3 h-3" />,
  },
  confirmado: {
    label: "Confirmado",
    classes: "bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20",
  },
  recusado: {
    label: "Recusado",
    classes: "bg-[#ff5252]/10 text-[#ff5252] border border-[#ff5252]/20",
  },
  pendente: {
    label: "Pendente",
    classes: "bg-[#6b7280]/10 text-[#a3a3a3] border border-[#6b7280]/20",
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
