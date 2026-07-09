import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Webhook Asaas — Processa eventos de pagamento e assinatura
 *
 * Endpoint: POST /api/webhooks/asaas
 * Documentação: https://docs.asaas.com/reference/webhooks
 *
 * Fluxo:
 * 1. Valida token (obrigatório)
 * 2. Identifica usuário (asaas_customer_id → subscription_id → payment_id)
 * 3. Processa evento com idempotência
 * 4. Atualiza subscription + profile + peladas
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    // ═══════════════════════════════════
    // 1. VALIDAÇÃO DO TOKEN (OBRIGATÓRIA)
    // ═══════════════════════════════════
    const token = request.headers.get("asaas-access-token")
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN

    if (!expectedToken) {
      console.error(`[${requestId}] ASAAS WEBHOOK: ASAAS_WEBHOOK_TOKEN não configurado!`)
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
    }

    if (token !== expectedToken) {
      console.warn(`[${requestId}] ASAAS WEBHOOK: Token inválido recebido`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ═══════════════════════════════════
    // 2. LEITURA DO EVENTO
    // ═══════════════════════════════════
    const body = await request.json()
    const { event, payment, subscription } = body

    console.log(`[${requestId}] ASAAS EVENTO RECEBIDO:`, JSON.stringify({ event, paymentId: payment?.id, subscriptionId: subscription?.id }, null, 2))

    if (!event) {
      return NextResponse.json({ error: "Event is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // ═══════════════════════════════════
    // 3. IDENTIFICAR USUÁRIO
    // ═══════════════════════════════════
    // Estratégia: tenta múltiplas formas de achar o userId
    const paymentId = payment?.id
    // Asaas pode retornar subscription como string (ID) ou como objeto
    const subscriptionId = typeof subscription?.id === "string"
      ? subscription.id
      : typeof payment?.subscription === "string"
        ? payment.subscription
        : null

    let userId: string | null = null

    // 3a. Tenta pelo asaas_customer_id no profile
    if (payment?.customer) {
      const customerId = payment.customer
      const { data: profileByCustomer } = await supabase
        .from("profiles")
        .select("id")
        .eq("asaas_customer_id", customerId)
        .maybeSingle()

      if (profileByCustomer) {
        userId = profileByCustomer.id
        console.log(`[${requestId}] Usuário encontrado por asaas_customer_id:`, userId)
      }
    }

    // 3b. Se não achou, tenta pelo asaas_subscription_id
    if (!userId && subscriptionId) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("asaas_subscription_id", subscriptionId)
        .maybeSingle()

      if (sub) {
        userId = sub.user_id
        console.log(`[${requestId}] Usuário encontrado por asaas_subscription_id:`, userId)
      } else {
        console.log(`[${requestId}] Subscription ${subscriptionId} não encontrada no banco — pode ser primeiro evento`)
      }
    }

    // 3c. Se não achou, tenta pelo asaas_payment_id na tabela payments
    if (!userId && paymentId) {
      const { data: pay } = await supabase
        .from("payments")
        .select("user_id")
        .eq("asaas_payment_id", paymentId)
        .maybeSingle()

      if (pay) {
        userId = pay.user_id
        console.log(`[${requestId}] Usuário encontrado por asaas_payment_id:`, userId)
      }
    }

    if (!userId) {
      console.warn(`[${requestId}] Usuário NÃO encontrado para evento ${event}. Payment:`, payment?.id, "Subscription:", subscriptionId)
      // Retorna 200 para não reenviar, mas registra o warning
      return NextResponse.json({ received: true, warning: "User not found" })
    }

    console.log(`[${requestId}] Processando evento ${event} para usuário ${userId}`)

    // ═══════════════════════════════════
    // 4. PROCESSAR EVENTO
    // ═══════════════════════════════════

    // Extrai datas do payment Asaas (formato: "2025-12-31")
    const dueDate = payment?.dueDate || null
    const paymentDate = payment?.paymentDate || payment?.clientPaymentDate || null
    const now = new Date().toISOString()

    // current_period_end = quando o período atual termina (dueDate + 30 dias para mensal)
    // grace_until = current_period_end + 3 dias de tolerância
    const currentPeriodEnd = dueDate
      ? new Date(new Date(dueDate + "T23:59:59").getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const graceUntil = dueDate
      ? new Date(new Date(currentPeriodEnd).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString()

    switch (event) {
      // ── PAGAMENTO CONFIRMADO ──
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        console.log(`[${requestId}] 🔓 LIBERANDO usuário ${userId}`)

        // Verificação de idempotência: só atualiza se não estiver ativo
        const { data: currentSub } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle()

        if (currentSub?.status === "active") {
          console.log(`[${requestId}] Assinatura já ativa — pulando atualização (idempotência)`)
        } else {
          console.log(`[${requestId}] Atualizando subscription para active...`)
          await supabase
            .from("subscriptions")
            .update({
              status: "active",
              current_period_start: now,
              current_period_end: currentPeriodEnd,
              grace_until: graceUntil,
              last_payment_at: paymentDate || now,
            })
            .eq("user_id", userId)

          console.log(`[${requestId}] Atualizando profile...`)
          await supabase
            .from("profiles")
            .update({
              subscription_status: "active",
              subscription_grace_until: graceUntil,
            })
            .eq("id", userId)
        }

        // ═══ Desbloqueia peladas ═══
        console.log(`[${requestId}] Desbloqueando peladas do usuário ${userId}...`)
        const { error: unblockError } = await supabase.rpc("unblock_creator_peladas", {
          p_user_id: userId,
        })
        if (unblockError) {
          console.error(`[${requestId}] Erro ao desbloquear peladas:`, unblockError)
        } else {
          console.log(`[${requestId}] ✅ Peladas desbloqueadas com sucesso`)
        }

        // ═══ Registra pagamento ═══
        if (paymentId) {
          await supabase.from("payments").insert({
            user_id: userId,
            asaas_payment_id: paymentId,
            amount: payment?.value || 30.0,
            status: "confirmed",
            due_date: dueDate,
            paid_at: paymentDate || now,
            raw_payload: body,
          })
          console.log(`[${requestId}] Pagamento ${paymentId} registrado`)
        }

        console.log(`[${requestId}] ✅ Usuário ${userId} liberado com sucesso!`)
        break
      }

      // ── PAGAMENTO VENCEU ──
      case "PAYMENT_OVERDUE": {
        console.log(`[${requestId}] ⏰ Pagamento vencido para usuário ${userId}`)

        // Seta grace_until = dueDate + 3 dias para que o bloqueio ocorra
        // corretamente após o período de tolerância
        const graceUntilOverdue = dueDate
          ? new Date(new Date(dueDate + "T23:59:59").getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

        await supabase
          .from("subscriptions")
          .update({ status: "past_due", grace_until: graceUntilOverdue })
          .eq("user_id", userId)

        await supabase
          .from("profiles")
          .update({ subscription_status: "past_due", subscription_grace_until: graceUntilOverdue })
          .eq("id", userId)

        // Se a tolerância já expirou, bloqueia imediatamente
        if (new Date(graceUntilOverdue) < new Date()) {
          console.log(`[${requestId}] Tolerância já expirou — bloqueando peladas...`)
          await supabase.rpc("block_creator_peladas", { p_user_id: userId })
        } else {
          console.log(`[${requestId}] Tolerância ativa até ${graceUntilOverdue} — não bloqueia ainda`)
        }

        if (paymentId) {
          await supabase.from("payments").insert({
            user_id: userId,
            asaas_payment_id: paymentId,
            amount: payment?.value || 30.0,
            status: "overdue",
            due_date: dueDate,
            raw_payload: body,
          })
        }
        break
      }

      // ── ASSINATURA CANCELADA ──
      case "SUBSCRIPTION_CANCELED":
      case "SUBSCRIPTION_DELETED": {
        console.log(`[${requestId}] 🚫 Assinatura cancelada para usuário ${userId}`)

        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("user_id", userId)

        await supabase
          .from("profiles")
          .update({ subscription_status: "canceled" })
          .eq("id", userId)

        // Bloqueia peladas pelo RPC
        await supabase.rpc("block_creator_peladas", { p_user_id: userId })
        console.log(`[${requestId}] Peladas bloqueadas (cancelamento)`)
        break
      }

      // ── ASSINATURA ATUALIZADA ──
      case "SUBSCRIPTION_UPDATED":
      case "SUBSCRIPTION_CREATED": {
        if (subscription) {
          const subId = typeof subscription.id === "string" ? subscription.id : null
          const subStatus = subscription.status === "ACTIVE" ? "active" : subscription.status === "PENDING" ? "pending" : "canceled"

          console.log(`[${requestId}] Subscription ${subId} atualizada para ${subStatus}`)

          if (subId) {
            await supabase
              .from("subscriptions")
              .update({ status: subStatus })
              .eq("asaas_subscription_id", subId)
          }

          await supabase
            .from("profiles")
            .update({ subscription_status: subStatus })
            .eq("id", userId)
        }
        break
      }

      default:
        console.log(`[${requestId}] Evento não tratado:`, event)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(`[${requestId}] ERRO no webhook:`, error)
    // Log detalhado para debugging
    if (error instanceof Error) {
      console.error(`[${requestId}] Stack:`, error.stack)
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
