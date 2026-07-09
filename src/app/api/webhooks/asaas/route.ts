import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Webhook Asaas — Simplificado
 *
 * Trata APENAS PAYMENT_RECEIVED.
 * Ativa usuário por 30 dias (expires_at = now + 30).
 * Sem subscriptions, sem grace period complexo.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // 1. Valida token
    const token = request.headers.get("asaas-access-token")
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN

    if (!expectedToken) {
      console.error(`[${requestId}] ASAAS_WEBHOOK_TOKEN não configurado`)
      return NextResponse.json({ error: "Not configured" }, { status: 500 })
    }

    if (token !== expectedToken) {
      console.warn(`[${requestId}] Token inválido`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Lê evento
    const body = await request.json()
    const { event, payment } = body

    console.log(`[${requestId}] Evento: ${event}`, { paymentId: payment?.id })

    // Só processa PAYMENT_RECEIVED
    if (event !== "PAYMENT_RECEIVED") {
      console.log(`[${requestId}] Evento ignorado: ${event}`)
      return NextResponse.json({ received: true })
    }

    if (!payment?.id) {
      return NextResponse.json({ error: "Invalid payment" }, { status: 400 })
    }

    // Valida status do payment
    if (payment.status !== "RECEIVED") {
      console.log(`[${requestId}] Payment ${payment.id} status ${payment.status} — ignorando (so processa RECEIVED)`)
      return NextResponse.json({ received: true })
    }

    const supabase = await createClient()
    const paymentId = payment.id

    // 3. Identifica usuário pelo customer_id
    const customerId = payment.customer
    let userId: string | null = null

    if (customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("asaas_customer_id", customerId)
        .maybeSingle()

      if (profile) {
        userId = profile.id
        console.log(`[${requestId}] Usuário encontrado por customer_id: ${userId}`)
      }
    }

    if (!userId) {
      console.warn(`[${requestId}] Usuário não encontrado para customer ${customerId}`)
      return NextResponse.json({ received: true, warning: "User not found" })
    }

    // 4. Verifica idempotência
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("subscription_status, subscription_expires_at")
      .eq("id", userId)
      .single()

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    if (currentProfile?.subscription_status === "active" && currentProfile?.subscription_expires_at) {
      const expiresDate = new Date(currentProfile.subscription_expires_at).getTime()
      if (expiresDate > Date.now()) {
        console.log(`[${requestId}] Assinatura já ativa até ${currentProfile.subscription_expires_at} — idempotência`)
        return NextResponse.json({ received: true })
      }
    }

    // 5. Ativa usuário
    console.log(`[${requestId}] 🔓 Ativando usuário ${userId} até ${expiresAt}`)

    await supabase
      .from("profiles")
      .update({
        subscription_status: "active",
        subscription_expires_at: expiresAt,
      })
      .eq("id", userId)

    // 6. Desbloqueia peladas
    const { error: unblockError } = await supabase.rpc("unblock_creator_peladas", {
      p_user_id: userId,
    })
    if (unblockError) {
      console.error(`[${requestId}] Erro ao desbloquear:`, unblockError)
    } else {
      console.log(`[${requestId}] ✅ Peladas desbloqueadas`)
    }

    // 7. Registra pagamento
    await supabase.from("payments").insert({
      user_id: userId,
      asaas_payment_id: paymentId,
      amount: payment.value || 30.0,
      status: "confirmed",
      due_date: payment.dueDate || null,
      paid_at: now,
      raw_payload: body,
    })

    console.log(`[${requestId}] ✅ Usuário ${userId} ativado com sucesso!`)
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(`[${requestId}] ERRO:`, error)
    if (error instanceof Error) console.error(`[${requestId}] Stack:`, error.stack)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
