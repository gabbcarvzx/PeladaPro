"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Toast } from "@/hooks/use-toast"

interface ToastContainerProps {
  toasts: Toast[]
  dismiss: (id: string) => void
}

const icons = {
  default: Info,
  success: CheckCircle,
  destructive: AlertCircle,
}

const variants = {
  default: "border-border",
  success: "border-primary bg-primary/5",
  destructive: "border-destructive bg-destructive/5",
}

export function ToastContainer({ toasts, dismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.variant ?? "default"]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-background p-4 shadow-lg",
                variants[toast.variant ?? "default"],
              )}
            >
              <Icon className={cn(
                "h-5 w-5 mt-0.5 shrink-0",
                toast.variant === "success" && "text-primary",
                toast.variant === "destructive" && "text-destructive",
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.description && (
                  <p className="text-sm text-muted-foreground mt-1">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md p-1 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
