import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createAsaasCustomer,
  updateAsaasCustomer,
  createAsaasSubscription,
  getAsaasSubscriptionPayments,
} from "@/lib/asaas"
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
   * Sempre envia cpfCnpj — a API Asaas exige.
   */
  async getOrCreateCustomer(
    userId: string,
    userEmail: string,
    userName: string,
    cpfCnpj: string,
    mobilePhone: string,
  ): Promise<string> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("asaas_customer_id")
      .eq("id", userId)
      .single()

    let customerId = (profile as any)?.asaas_customer_id

    if (!customerId) {
      // Customer novo — cria com CPF obrigatório
      const customer = await createAsaasCustomer({
        name: userName,
        email: userEmail,
        cpfCnpj,
        mobilePhone,
      })
      customerId = customer.id

      await this.supabase
        .from("profiles")
        .update({ asaas_customer_id: customerId })
        .eq("id", userId)
    } else if (cpfCnpj) {
      // Customer já existe — atualiza CPF (pode ter sido criado sem)
      try {
        await updateAsaasCustomer(customerId, { cpfCnpj, mobilePhone })
      } catch {
        // Fallback: se customer foi deletado no Asaas, cria novo
        const customer = await createAsaasCustomer({
          name: userName,
          email: userEmail,
          cpfCnpj,
          mobilePhone,
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
   * Cria assinatura no Asaas e no banco, retorna invoiceUrl para pagamento.
   *
   * Fluxo correto (sem /checkout):
   * 1. Cria subscription → Asaas gera 1ª cobrança automaticamente
   * 2. Busca os payments da subscription
   * 3. Retorna invoiceUrl da 1ª cobrança
   */
  async createSubscriptionAndGetPaymentUrl(
    userId: string,
    customerId: string,
  ): Promise<string> {
    // 1. Verifica se já tem subscription ativa
    const existing = await this.subscriptionService.getSubscription(userId)
    let subscriptionId: string

    if (existing?.asaas_subscription_id) {
      subscriptionId = existing.asaas_subscription_id
    } else {
      // Cria nova subscription no Asaas
      const asaasSub = await createAsaasSubscription({
        customer: customerId,
        value: 30.0,
        description: "PeladaPro - Plano Mensal",
        billingType: "BOLETO",
        cycle: "MONTHLY",
      })
      subscriptionId = asaasSub.id
    }

    // 2. Upsert subscription no banco
    const now = new Date().toISOString()
    const graceDate = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString()

    await this.supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        asaas_customer_id: customerId,
        asaas_subscription_id: subscriptionId,
        status: "pending",
        plan_price: 30.0,
        current_period_start: now,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        grace_until: graceDate,
      },
      { onConflict: "user_id" },
    )

    await this.supabase
      .from("profiles")
      .update({
        subscription_status: "pending",
        subscription_grace_until: graceDate,
      })
      .eq("id", userId)

    // 3. Busca a 1ª cobrança gerada pela subscription (contém invoiceUrl)
    const payments = await getAsaasSubscriptionPayments(subscriptionId, 1)
    if (payments.length === 0) {
      throw new Error("Nenhuma cobrança foi gerada para esta assinatura.")
    }

    const invoiceUrl = payments[0].invoiceUrl
    if (!invoiceUrl) {
      throw new Error("URL de pagamento não disponível. Tente novamente.")
    }

    return invoiceUrl
  }
}
