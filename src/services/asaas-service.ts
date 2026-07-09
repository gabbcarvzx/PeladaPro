import type { SupabaseClient } from "@supabase/supabase-js"
import { createAsaasCustomer, updateAsaasCustomer, findAsaasCustomerByEmail, createAsaasSubscription, createAsaasCheckout, cancelAsaasSubscription } from "@/lib/asaas"
import { SubscriptionService } from "./subscription-service"

export class AsaasService {
  private supabase: SupabaseClient
  private subscriptionService: SubscriptionService

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
    this.subscriptionService = new SubscriptionService(supabase)
  }

  /**
   * Cria ou busca o customer Asaas e retorna o ID.
   */
  async getOrCreateCustomer(userId: string, userEmail: string, userName: string, cpfCnpj: string, phone: string): Promise<string> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("asaas_customer_id")
      .eq("id", userId)
      .single()

    let customerId = (profile as any)?.asaas_customer_id

    if (!customerId) {
      // Cria customer NOVO com CPF/CNPJ obrigatório
      const customer = await createAsaasCustomer({
        name: userName,
        email: userEmail,
        cpfCnpj,
        phone,
      })
      customerId = customer.id

      await this.supabase
        .from("profiles")
        .update({ asaas_customer_id: customerId })
        .eq("id", userId)
    } else if (cpfCnpj) {
      // Customer já existe — atualiza com CPF/CNPJ (pode ter sido criado SEM CPF)
      try {
        await updateAsaasCustomer(customerId, { cpfCnpj, phone })
      } catch {
        // Se falhar, tenta criar novo customer (customer pode ter sido deletado no Asaas)
        const customer = await createAsaasCustomer({
          name: userName,
          email: userEmail,
          cpfCnpj,
          phone,
        })
        customerId = customer.id

        await this.supabase
          .from("profiles")
          .update({ asaas_customer_id: customerId })
          .eq("id", userId)
      }
    }

    return customerId
  }

  /**
   * Cria assinatura no Asaas e no banco, retorna URL do checkout.
   */
  async createSubscriptionAndCheckout(userId: string, customerId: string): Promise<string> {
    let subscriptionId: string
    const existing = await this.subscriptionService.getSubscription(userId)

    if (existing?.asaas_subscription_id) {
      subscriptionId = existing.asaas_subscription_id
    } else {
      const asaasSub = await createAsaasSubscription({
        customerId,
        value: 30.0,
        description: "PeladaPro - Plano Mensal",
        billingType: "PIX",
      })
      subscriptionId = asaasSub.id
    }

    const now = new Date().toISOString()
    const graceDate = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString()

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

    await this.supabase
      .from("profiles")
      .update({
        subscription_status: "pending",
        subscription_grace_until: graceDate,
      })
      .eq("id", userId)

    const { url } = await createAsaasCheckout({
      subscriptionId,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard`,
    })

    return url
  }
}
