import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AsaasService } from "@/services/asaas-service"

/**
 * POST /api/asaas/create-payment
 *
 * Fluxo SIMPLIFICADO:
 * 1. Valida autenticação e CPF/CNPJ
 * 2. Cria/recupera customer Asaas
 * 3. Cria cobrança única (POST /v3/payments)
 * 4. Retorna invoiceUrl para redirecionar o usuário
 *
 * Sem subscriptions. Ativação via webhook + expires_at.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Verifica autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Lê e valida dados
    const body = await request.json()
    const { cpfCnpj, phone, nome } = body

    if (!cpfCnpj || typeof cpfCnpj !== "string") {
      return NextResponse.json({ error: "CPF ou CNPJ é obrigatório." }, { status: 400 })
    }

    const cpfCnpjLimpo = cpfCnpj.replace(/\D/g, "")
    if (cpfCnpjLimpo.length !== 11 && cpfCnpjLimpo.length !== 14) {
      return NextResponse.json({ error: "CPF deve ter 11 dígitos ou CNPJ 14 dígitos." }, { status: 400 })
    }

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Telefone é obrigatório." }, { status: 400 })
    }

    const mobilePhoneLimpo = phone.replace(/\D/g, "")
    if (mobilePhoneLimpo.length < 10 || mobilePhoneLimpo.length > 11) {
      return NextResponse.json({ error: "Telefone inválido." }, { status: 400 })
    }

    // 3. Busca nome do perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .single()

    const userName = nome || (profile as any)?.nome || user.email

    // 4. Cria/recupera customer
    const asaasService = new AsaasService(supabase)
    const customerId = await asaasService.getOrCreateCustomer(
      user.id, user.email, userName,
      cpfCnpjLimpo, mobilePhoneLimpo,
    )

    // 5. Cria cobrança única e retorna invoiceUrl
    const invoiceUrl = await asaasService.createPaymentAndGetInvoiceUrl(user.id, customerId)

    return NextResponse.json({ invoiceUrl })
  } catch (error) {
    console.error("[CREATE PAYMENT API]", error)

    const message = error instanceof Error
      ? error.message.includes("cpf") || error.message.includes("CPF")
        ? "CPF ou CNPJ inválido."
        : "Não foi possível criar o pagamento. Verifique seus dados."
      : "Não foi possível criar o pagamento."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
