import type { SupabaseClient } from "@supabase/supabase-js"
import { createAsaasCustomer, findAsaasCustomerByEmail, createAsaasSubscription, createAsaasCheckout, cancelAsaasSubscription } from "@/lib/asaas"
import { SubscriptionService } from "./subscription-service"

export class AsaasService {
  private supabase: SupabaseClient
  private subscriptionService: SubscriptionService

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
    this.subscriptionService = new SubscriptionService(supabase)
  }

  /**
   * Gera o checkout para assinatura do usuário.
   * Cria customer no Asaas se necessário, cria assinatura, e retorna URL do checkout.
   */
  async generateCheckout(userId: string, userEmail: string, userName: string): Promise<string> {
    // 1. Verifica se já tem asaas_customer_id no profile
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("asaas_customer_id")
      .eq("id", userId)
      .single()

    let customerId = (profile as any)?.asaas_customer_id

    // 2. Se não tem customer, cria no Asaas
    if (!customerId) {
      const customer = await createAsaasCustomer({
        name: userName,
        email: userEmail,
      })
      customerId = customer.id

      // Salva no profile
      await this.supabase
        .from("profiles")
        .update({ asaas_customer_id: customerId })
        .eq("id", userId)
    }

    // 3. Cria ou atualiza subscription no banco
    let subscriptionId: string
    const existing = await this.subscriptionService.getSubscription(userId)

    if (existing?.asaas_subscription_id) {
      // Já tem assinatura no Asaas - usa ela
      subscriptionId = existing.asaas_subscription_id
    } else {
      // Cria nova assinatura no Asaas
      const asaasSub = await createAsaasSubscription({
        customerId,
        value: 30.0,
        description: "PeladaPro - Plano Mensal",
        billingType: "PIX",
      })
      subscriptionId = asaasSub.id
    }

    // 4. Upsert subscription no banco
    const now = new Date().toISOString()
    const graceDate = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString() // 30 dias + 3 de tolerância

    await this.supabase.from("subscriptions").upsert({
      user_id: userId,
      asaas_customer_id: customerId,
      asaas_subscription_id: subscriptionId,
      status: "pending",
      plan_price: 30.0,
      current_period_start: now,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      grace_until: graceDate,
    }, {
      onConflict: "user_id",
    })

    // 5. Atualiza profile
    await this.supabase
      .from("profiles")
      .update({
        subscription_status: "pending",
        subscription_grace_until: graceDate,
      })
      .eq("id", userId)

    // 6. Gera URL do checkout
    const { url } = await createAsaasCheckout({
      subscriptionId,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard`,
    })

    return url
  }
}
