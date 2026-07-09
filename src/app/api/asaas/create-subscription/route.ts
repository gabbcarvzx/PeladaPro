import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AsaasService } from "@/services/asaas-service"

/**
 * POST /api/asaas/create-subscription
 *
 * Fluxo correto Asaas v3:
 * 1. Valida autenticação e dados (CPF/CNPJ, telefone)
 * 2. Cria ou recupera customer no Asaas (sempre com CPF)
 * 3. Cria subscription no Asaas (gera 1ª cobrança automaticamente)
 * 4. Busca invoiceUrl da 1ª cobrança
 * 5. Retorna invoiceUrl para redirecionar o usuário
 *
 * Server-side apenas — nunca expõe ASAAS_API_KEY.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Verifica autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Lê e valida dados do body
    const body = await request.json()
    const { cpfCnpj, phone, nome } = body

    // --- CPF/CNPJ ---
    if (!cpfCnpj || typeof cpfCnpj !== "string") {
      return NextResponse.json(
        { error: "CPF ou CNPJ é obrigatório." },
        { status: 400 },
      )
    }

    const cpfCnpjLimpo = cpfCnpj.replace(/\D/g, "")
    if (cpfCnpjLimpo.length !== 11 && cpfCnpjLimpo.length !== 14) {
      return NextResponse.json(
        { error: "CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos." },
        { status: 400 },
      )
    }

    // --- Telefone ---
    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Telefone é obrigatório." },
        { status: 400 },
      )
    }

    const mobilePhoneLimpo = phone.replace(/\D/g, "")
    if (mobilePhoneLimpo.length < 10 || mobilePhoneLimpo.length > 11) {
      return NextResponse.json(
        { error: "Telefone inválido. Informe o DDD + número (ex: 11999999999)." },
        { status: 400 },
      )
    }

    // 3. Busca nome do perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .single()

    const userName = nome || (profile as any)?.nome || user.email

    // 4. Cria ou recupera customer no Asaas
    const asaasService = new AsaasService(supabase)
    const customerId = await asaasService.getOrCreateCustomer(
      user.id,
      user.email,
      userName,
      cpfCnpjLimpo,
      mobilePhoneLimpo,
    )

    // 5. Cria subscription e obtém invoiceUrl (sem /checkout!)
    const invoiceUrl = await asaasService.createSubscriptionAndGetPaymentUrl(
      user.id,
      customerId,
    )

    return NextResponse.json({ invoiceUrl })
  } catch (error) {
    console.error("[CREATE SUBSCRIPTION API] Erro completo:", error)

    // Mensagem amigável — nunca expõe stack trace
    const message =
      error instanceof Error
        ? error.message.includes("cpfCnpj") || error.message.includes("CPF") || error.message.includes("cpf")
          ? "CPF ou CNPJ inválido. Verifique os dados e tente novamente."
          : "Não foi possível criar a assinatura. Verifique seus dados e tente novamente."
        : "Não foi possível criar a assinatura. Verifique seus dados e tente novamente."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
