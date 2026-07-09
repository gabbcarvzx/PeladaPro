import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createAsaasCustomer,
  updateAsaasCustomer,
  createAsaasPayment,
} from "@/lib/asaas"

export class AsaasService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Cria ou busca customer Asaas. Sempre envia cpfCnpj.
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
      try {
        await updateAsaasCustomer(customerId, { cpfCnpj, mobilePhone })
      } catch {
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
   * Cria cobrança única no Asaas e retorna invoiceUrl.
   * Sem subscriptions — controle interno via expires_at.
   */
  async createPaymentAndGetInvoiceUrl(
    userId: string,
    customerId: string,
  ): Promise<string> {
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const payment = await createAsaasPayment({
      customer: customerId,
      billingType: "PIX",
      value: 30.0,
      dueDate,
      description: "PeladaPro - Plano Mensal",
    })

    if (!payment.invoiceUrl) {
      throw new Error("URL de pagamento não disponível. Tente novamente.")
    }

    // Salva o payment ID no banco para rastreabilidade
    await this.supabase.from("payments").insert({
      user_id: userId,
      asaas_payment_id: payment.id,
      amount: 30.0,
      status: "pending",
      due_date: dueDate,
      raw_payload: { id: payment.id, status: payment.status },
    })

    return payment.invoiceUrl
  }
}
