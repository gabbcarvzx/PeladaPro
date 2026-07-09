// ==========================================
// Asaas API Client
// ==========================================
// Documentação: https://docs.asaas.com
// Sandbox: https://api-sandbox.asaas.com/v3
// Produção: https://api.asaas.com/v3

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3"
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || ""

interface AsaasCustomer {
  id: string
  name: string
  email: string
  cpfCnpj?: string
  phone?: string
}

interface AsaasSubscription {
  id: string
  customer: string
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED"
  value: number
  nextDueDate: string
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "ANNUALLY"
  description?: string
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "CANCELED"
}

interface AsaasCheckout {
  url: string
  subscriptionId: string
}

interface AsaasPayment {
  id: string
  subscription: string
  value: number
  netValue: number
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED"
  dueDate: string
  paymentDate: string | null
  clientPaymentDate: string | null
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD"
}

interface AsaasWebhookEvent {
  event: "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED" | "PAYMENT_OVERDUE" | "PAYMENT_DELETED" | "PAYMENT_REFUNDED" | "SUBSCRIPTION_UPDATED" | "SUBSCRIPTION_DELETED" | "SUBSCRIPTION_CANCELED"
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

async function fetchAsaas<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${ASAAS_API_URL}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Asaas API error (${response.status}): ${error}`)
  }

  return response.json()
}

/**
 * Cria um customer no Asaas
 */
export async function createAsaasCustomer(data: {
  name: string
  email: string
  cpfCnpj: string
  phone: string
}): Promise<AsaasCustomer> {
  return fetchAsaas<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * Atualiza um customer existente no Asaas (ex: para adicionar CPF)
 */
export async function updateAsaasCustomer(
  customerId: string,
  data: { cpfCnpj?: string; phone?: string; name?: string },
): Promise<AsaasCustomer> {
  return fetchAsaas<AsaasCustomer>(`/customers/${customerId}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * Busca customer por email
 */
export async function findAsaasCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
  const result = await fetchAsaas<{ data: AsaasCustomer[] }>(`/customers?email=${encodeURIComponent(email)}`)
  return result.data.length > 0 ? result.data[0] : null
}

/**
 * Cria uma assinatura mensal
 */
export async function createAsaasSubscription(data: {
  customerId: string
  value: number
  description?: string
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED"
  nextDueDate?: string
}): Promise<AsaasSubscription> {
  return fetchAsaas<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: data.customerId,
      value: data.value,
      description: data.description || "PeladaPro - Plano Mensal",
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      nextDueDate: data.nextDueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    }),
  })
}

/**
 * Cria um checkout Asaas para pagamento de assinatura
 */
export async function createAsaasCheckout(data: {
  subscriptionId: string
  redirectUrl?: string
}): Promise<AsaasCheckout> {
  return fetchAsaas<AsaasCheckout>("/checkout", {
    method: "POST",
    body: JSON.stringify({
      subscription: data.subscriptionId,
      redirectUrl: data.redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard`,
    }),
  })
}

/**
 * Busca detalhes de um pagamento
 */
export async function getAsaasPayment(paymentId: string): Promise<AsaasPayment> {
  return fetchAsaas<AsaasPayment>(`/payments/${paymentId}`)
}

/**
 * Busca detalhes de uma assinatura
 */
export async function getAsaasSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return fetchAsaas<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}

/**
 * Cancela uma assinatura
 */
export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  await fetchAsaas(`/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  })
}

export type { AsaasCustomer, AsaasSubscription, AsaasCheckout, AsaasPayment, AsaasWebhookEvent }
