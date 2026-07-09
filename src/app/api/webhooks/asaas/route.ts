import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Webhook Asaas - Processa eventos de pagamento e assinatura
 *
 * Endpoint: POST /api/webhooks/asaas
 * Documentação: https://docs.asaas.com/reference/webhooks
 *
 * Eventos tratados:
 * - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → ativa assinatura
 * - PAYMENT_OVERDUE → marca como past_due
 * - PAYMENT_DELETED / PAYMENT_REFUNDED → mantém registro
 * - SUBSCRIPTION_UPDATED → atualiza dados
 * - SUBSCRIPTION_CANCELED / SUBSCRIPTION_DELETED → cancela
 */

export async function POST(request: Request) {
  try {
    // Validação opcional do token do webhook
    const token = request.headers.get("asaas-access-token")
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN

    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { event, payment, subscription } = body

    if (!event) {
      return NextResponse.json({ error: "Event is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Busca user_id pelo asaas_subscription_id ou asaas_payment_id
    const subscriptionId = subscription?.id || payment?.subscription
    const paymentId = payment?.id

    let userId: string | null = null

    if (subscriptionId) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("asaas_subscription_id", subscriptionId)
        .maybeSingle()

      if (sub) userId = sub.user_id
    }

    if (!userId && paymentId) {
      const { data: pay } = await supabase
        .from("payments")
        .select("user_id")
        .eq("asaas_payment_id", paymentId)
        .maybeSingle()

      if (pay) userId = pay.user_id
    }

    if (!userId) {
      console.warn("[ASAAS WEBHOOK] Usuário não encontrado para evento:", event)
      return NextResponse.json({ received: true })
    }

    const now = new Date().toISOString()
    const graceDate = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString() // 30 + 3 dias

    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        // Pagamento confirmado → ativa assinatura
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            current_period_start: now,
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            grace_until: graceDate,
            last_payment_at: now,
          })
          .eq("user_id", userId)

        await supabase
          .from("profiles")
          .update({
            subscription_status: "active",
            subscription_grace_until: graceDate,
          })
          .eq("id", userId)

        // Desbloqueia peladas
        await supabase.rpc("unblock_creator_peladas", { p_user_id: userId })

        // Registra pagamento
        if (paymentId) {
          await supabase.from("payments").insert({
            user_id: userId,
            asaas_payment_id: paymentId,
            amount: payment?.value || 30.0,
            status: "confirmed",
            due_date: payment?.dueDate || null,
            paid_at: now,
            raw_payload: body,
          })
        }
        break

      case "PAYMENT_OVERDUE":
        // Pagamento venceu → marca como past_due
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("user_id", userId)

        await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("id", userId)

        // Registra pagamento vencido
        if (paymentId) {
          await supabase.from("payments").insert({
            user_id: userId,
            asaas_payment_id: paymentId,
            amount: payment?.value || 30.0,
            status: "overdue",
            due_date: payment?.dueDate || null,
            raw_payload: body,
          })
        }
        break

      case "SUBSCRIPTION_CANCELED":
      case "SUBSCRIPTION_DELETED":
        // Assinatura cancelada
        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("user_id", userId)

        await supabase
          .from("profiles")
          .update({ subscription_status: "canceled" })
          .eq("id", userId)

        // Bloqueia peladas (já passou da tolerância)
        await supabase.rpc("block_creator_peladas", { p_user_id: userId })
        break

      case "SUBSCRIPTION_UPDATED":
        if (subscription) {
          const subStatus = subscription.status === "ACTIVE" ? "active" : "canceled"
          await supabase
            .from("subscriptions")
            .update({ status: subStatus })
            .eq("asaas_subscription_id", subscription.id)

          await supabase
            .from("profiles")
            .update({ subscription_status: subStatus })
            .eq("id", userId)
        }
        break

      default:
        console.log("[ASAAS WEBHOOK] Evento não tratado:", event)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[ASAAS WEBHOOK] Erro:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
