"use client"

import { ToastContainer } from "@/components/ui/toast"
import { useToast, type Toast } from "@/hooks/use-toast"

let globalToastFn: (props: Omit<Toast, "id">) => void

export function Toaster() {
  const { toasts, toast, dismiss } = useToast()
  globalToastFn = toast
  return <ToastContainer toasts={toasts} dismiss={dismiss} />
}

export function toast(props: Omit<Toast, "id">) {
  if (globalToastFn) {
    globalToastFn(props)
  }
}
