import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AsaasService } from "@/services/asaas-service"

/**
 * POST /api/asaas/create-subscription
 *
 * Cria customer no Asaas com CPF/CNPJ, cria assinatura e retorna URL do checkout.
 * Server-side apenas — nunca expõe ASAAS_API_KEY no client.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Verifica autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Lê dados do body
    const body = await request.json()
    const { cpfCnpj, phone, nome } = body

    // 3. Valida CPF/CNPJ
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

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Telefone é obrigatório." },
        { status: 400 },
      )
    }

    const phoneLimpo = phone.replace(/\D/g, "")
    if (phoneLimpo.length < 10 || phoneLimpo.length > 11) {
      return NextResponse.json(
        { error: "Telefone inválido. Informe o DDD + número." },
        { status: 400 },
      )
    }

    // 4. Busca o nome do perfil (ou usa o enviado)
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .single()

    const userName = nome || (profile as any)?.nome || user.email

    // 5. Cria customer no Asaas (sempre com CPF/CNPJ)
    const asaasService = new AsaasService(supabase)
    const customerId = await asaasService.getOrCreateCustomer(
      user.id,
      user.email,
      userName,
      cpfCnpjLimpo,
      phoneLimpo,
    )

    // 6. Cria assinatura e retorna URL do checkout
    const url = await asaasService.createSubscriptionAndCheckout(
      user.id,
      customerId,
    )

    return NextResponse.json({ url })
  } catch (error) {
    console.error("[CREATE SUBSCRIPTION API] Erro:", error)

    const message =
      error instanceof Error
        ? error.message.includes("cpfCnpj") || error.message.includes("CPF")
          ? "CPF ou CNPJ inválido. Verifique os dados e tente novamente."
          : error.message
        : "Erro ao criar assinatura. Tente novamente."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
