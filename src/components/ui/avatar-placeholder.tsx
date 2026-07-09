"use client"

import { cn } from "@/lib/utils"

const GRADIENTS = [
  "from-primary to-blue-600",
  "from-purple-500 to-pink-500",
  "from-amber-500 to-orange-600",
  "from-teal-400 to-cyan-600",
  "from-rose-400 to-red-600",
  "from-indigo-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
]

function getGradientForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

interface AvatarPlaceholderProps {
  name?: string | null
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

const sizeClasses = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-2xl",
}

export function AvatarPlaceholder({ name, className, size = "md" }: AvatarPlaceholderProps) {
  const initial = name?.charAt(0)?.toUpperCase() || "?"
  const gradient = getGradientForName(name || "?")

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br text-white font-bold shrink-0",
        gradient,
        sizeClasses[size],
        className,
      )}
      title={name || "Usuário"}
    >
      {initial}
    </div>
  )
}
