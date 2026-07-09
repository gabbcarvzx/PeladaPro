"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toaster"
import {
  Loader2,
  Lock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
} from "lucide-react"

interface PreCheckoutModalProps {
  open: boolean
  onClose: () => void
  userEmail: string
  userName: string
}

// Valida CPF (algoritmo oficial dos dígitos verificadores)
function validarCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, "").split("").map(Number)
  if (nums.length !== 11) return false
  // Verifica se todos são iguais (ex: 111.111.111-11)
  if (nums.every((n) => n === nums[0])) return false

  // Primeiro dígito verificador
  let soma = 0
  for (let i = 0; i < 9; i++) soma += nums[i] * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== nums[9]) return false

  // Segundo dígito verificador
  soma = 0
  for (let i = 0; i < 10; i++) soma += nums[i] * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== nums[10]) return false

  return true
}

// Valida CNPJ (algoritmo oficial dos dígitos verificadores)
function validarCNPJ(cnpj: string): boolean {
  const nums = cnpj.replace(/\D/g, "").split("").map(Number)
  if (nums.length !== 14) return false
  if (nums.every((n) => n === nums[0])) return false

  // Primeiro dígito
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let soma = 0
  for (let i = 0; i < 12; i++) soma += nums[i] * pesos1[i]
  let resto = soma % 11
  if (resto < 2) resto = 0
  else resto = 11 - resto
  if (resto !== nums[12]) return false

  // Segundo dígito
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  soma = 0
  for (let i = 0; i < 13; i++) soma += nums[i] * pesos2[i]
  resto = soma % 11
  if (resto < 2) resto = 0
  else resto = 11 - resto
  if (resto !== nums[13]) return false

  return true
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5)
    return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function PreCheckoutModal({
  open,
  onClose,
  userEmail,
  userName,
}: PreCheckoutModalProps) {
  const [tipoPessoa, setTipoPessoa] = useState<"fisica" | "juridica">("fisica")
  const [documento, setDocumento] = useState("")
  const [telefone, setTelefone] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const limpar = useCallback(() => {
    setDocumento("")
    setTelefone("")
    setErrors({})
    setLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    limpar()
    onClose()
  }, [limpar, onClose])

  const validar = (): boolean => {
    const novosErros: Record<string, string> = {}
    const docLimpo = documento.replace(/\D/g, "")

    if (!documento) {
      novosErros.documento = tipoPessoa === "fisica" ? "CPF é obrigatório." : "CNPJ é obrigatório."
    } else if (tipoPessoa === "fisica") {
      if (docLimpo.length !== 11) {
        novosErros.documento = "CPF deve ter 11 dígitos."
      } else if (!validarCPF(documento)) {
        novosErros.documento = "CPF inválido. Verifique os dígitos."
      }
    } else {
      if (docLimpo.length !== 14) {
        novosErros.documento = "CNPJ deve ter 14 dígitos."
      } else if (!validarCNPJ(documento)) {
        novosErros.documento = "CNPJ inválido. Verifique os dígitos."
      }
    }

    if (!telefone) {
      novosErros.telefone = "Telefone é obrigatório."
    } else {
      const telLimpo = telefone.replace(/\D/g, "")
      if (telLimpo.length < 10 || telLimpo.length > 11) {
        novosErros.telefone = "Telefone inválido. Informe DDD + número (ex: 11999999999)."
      }
    }

    setErrors(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const handleSubmit = async () => {
    if (!validar()) return

    setLoading(true)
    setErrors({})

    try {
      const docLimpo = documento.replace(/\D/g, "")
      const telLimpo = telefone.replace(/\D/g, "")

      const response = await fetch("/api/asaas/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpfCnpj: docLimpo,
          phone: telLimpo,
          nome: userName,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar assinatura")
      }

      if (data.invoiceUrl) {
        // Redireciona para o link de pagamento da cobrança (boleto/PIX/cartão)
        window.location.href = data.invoiceUrl
      } else {
        throw new Error("URL de pagamento não recebida")
      }
    } catch (error) {
      toast({
        title: "Erro ao criar assinatura",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível criar a assinatura. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Lock className="h-5 w-5 text-[#00e676]" />
            Dados para assinatura
          </DialogTitle>
          <DialogDescription>
            Para ativar sua assinatura, precisamos de alguns dados obrigatórios
            para emissão da cobrança. Seus dados estão seguros 🔒
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Email (readonly) */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input
                id="email"
                value={userEmail}
                readOnly
                className="opacity-60 cursor-not-allowed pl-9"
              />
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Tipo de Pessoa */}
          <div className="space-y-1.5">
            <Label>Tipo de Pessoa</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipoPessoa("fisica")
                  setDocumento("")
                  setErrors((e) => ({ ...e, documento: "" }))
                }}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-all duration-200 ${
                  tipoPessoa === "fisica"
                    ? "border-[#00e676] bg-[#00e676]/10 text-[#00e676]"
                    : "border-border bg-background text-muted-foreground hover:border-[#00e676]/40"
                }`}
              >
                Pessoa Física
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipoPessoa("juridica")
                  setDocumento("")
                  setErrors((e) => ({ ...e, documento: "" }))
                }}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-all duration-200 ${
                  tipoPessoa === "juridica"
                    ? "border-[#00e676] bg-[#00e676]/10 text-[#00e676]"
                    : "border-border bg-background text-muted-foreground hover:border-[#00e676]/40"
                }`}
              >
                Pessoa Jurídica
              </button>
            </div>
          </div>

          {/* CPF / CNPJ */}
          <div className="space-y-1.5">
            <Label htmlFor="documento">
              {tipoPessoa === "fisica" ? "CPF" : "CNPJ"}
            </Label>
            <Input
              id="documento"
              value={documento}
              onChange={(e) =>
                setDocumento(
                  tipoPessoa === "fisica"
                    ? formatCPF(e.target.value)
                    : formatCNPJ(e.target.value),
                )
              }
              placeholder={
                tipoPessoa === "fisica"
                  ? "000.000.000-00"
                  : "00.000.000/0000-00"
              }
              maxLength={tipoPessoa === "fisica" ? 14 : 18}
              className={errors.documento ? "border-red-500" : ""}
            />
            {errors.documento && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1 text-xs text-red-500"
              >
                <AlertCircle className="h-3 w-3" />
                {errors.documento}
              </motion.p>
            )}
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone (com DDD)</Label>
            <div className="relative">
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={16}
                className={errors.telefone ? "border-red-500 pl-9" : "pl-9"}
              />
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {errors.telefone && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1 text-xs text-red-500"
              >
                <AlertCircle className="h-3 w-3" />
                {errors.telefone}
              </motion.p>
            )}
          </div>

          {/* Segurança */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Seus dados são enviados com segurança para o Asaas (gateway de pagamento).
              Nenhuma informação de cartão de crédito trafega pelos nossos servidores.
            </span>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            variant="glow"
            size="lg"
            className="w-full h-12 text-base"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Criando assinatura...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-5 w-5" />
                Assinar por R$ 30/mês
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
