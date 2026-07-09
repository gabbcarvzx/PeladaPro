// ==========================================
// Asaas API Client — v3 Official
// ==========================================
// Documentação: https://docs.asaas.com
// Sandbox: https://api-sandbox.asaas.com/v3
// Produção: https://api.asaas.com/v3
//
// Fluxo correto:
// 1. POST /v3/customers           → cria customer
// 2. POST /v3/subscriptions        → cria assinatura (gera 1ª cobrança)
// 3. GET  /v3/subscriptions/{id}/payments → obtém invoiceUrl da cobrança
// 4. Redireciona usuário para invoiceUrl
// 5. Webhook processa PAYMENT_CONFIRMED

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3"
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || ""

// ==========================================
// Tipos da API Asaas
// ==========================================

interface AsaasCustomer {
  id: string
  name: string
  email: string
  cpfCnpj: string
  mobilePhone?: string
  dateCreated?: string
}

/** Resposta da subscription — não contém invoiceUrl diretamente */
interface AsaasSubscription {
  id: string
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  nextDueDate: string
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "ANNUALLY"
  description?: string
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "CANCELED" | "PENDING"
  paymentLink?: string | null
}

/** Payment/cobrança individual — contém invoiceUrl para redirecionar o usuário */
interface AsaasPayment {
  id: string
  subscription: string
  value: number
  netValue: number
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED"
  dueDate: string
  invoiceUrl: string
  bankSlipUrl: string | null
  pixQrCode: string | null
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX"
}

interface AsaasPaymentList {
  data: AsaasPayment[]
  totalCount: number
}

interface AsaasWebhookEvent {
  event: "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED" | "PAYMENT_OVERDUE" | "PAYMENT_DELETED" | "PAYMENT_REFUNDED" | "PAYMENT_CREATED" | "SUBSCRIPTION_CREATED" | "SUBSCRIPTION_UPDATED" | "SUBSCRIPTION_DELETED" | "SUBSCRIPTION_CANCELED"
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

// ==========================================
// HTTP Client
// ==========================================

interface AsaasApiError {
  errors: Array<{
    code: string
    description: string
  }>
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
    const errorText = await response.text()
    console.error("[ASAAS API ERROR]", response.status, path, errorText)

    // Tenta extrair mensagem legível do erro Asaas
    let message = `Erro na API Asaas (${response.status})`
    try {
      const parsed: AsaasApiError = JSON.parse(errorText)
      if (parsed.errors?.length > 0) {
        message = parsed.errors[0].description
      }
    } catch {
      // Se não conseguir parsear, usa o texto bruto
      message = errorText.slice(0, 200)
    }

    throw new Error(message)
  }

  return response.json()
}

// ==========================================
// Customers
// ==========================================

/**
 * Cria um customer no Asaas.
 * cpfCnpj é OBRIGATÓRIO — a API rejeita sem ele.
 */
export async function createAsaasCustomer(data: {
  name: string
  email: string
  cpfCnpj: string
  mobilePhone: string
}): Promise<AsaasCustomer> {
  return fetchAsaas<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * Atualiza um customer existente.
 */
export async function updateAsaasCustomer(
  customerId: string,
  data: { cpfCnpj?: string; mobilePhone?: string; name?: string },
): Promise<AsaasCustomer> {
  return fetchAsaas<AsaasCustomer>(`/customers/${customerId}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/**
 * Busca customer por email (para não duplicar).
 */
export async function findAsaasCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
  const result = await fetchAsaas<{ data: AsaasCustomer[] }>(
    `/customers?email=${encodeURIComponent(email)}`,
  )
  return result.data.length > 0 ? result.data[0] : null
}

// ==========================================
// Subscriptions
// ==========================================

/**
 * Cria uma assinatura mensal.
 * A subscription gera automaticamente a 1ª cobrança (payment).
 * Para obter a URL de pagamento, use getSubscriptionPayments().
 */
export async function createAsaasSubscription(data: {
  customer: string
  value: number
  description: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX"
  cycle: "MONTHLY" | "WEEKLY" | "BIWEEKLY"
}): Promise<AsaasSubscription> {
  return fetchAsaas<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: data.customer,
      value: data.value,
      description: data.description,
      billingType: data.billingType,
      cycle: data.cycle,
    }),
  })
}

/**
 * Busca os payments (cobranças) de uma assinatura.
 * A primeira cobrança contém o invoiceUrl para redirecionar o usuário.
 */
export async function getAsaasSubscriptionPayments(
  subscriptionId: string,
  limit = 1,
): Promise<AsaasPayment[]> {
  const result = await fetchAsaas<AsaasPaymentList>(
    `/subscriptions/${subscriptionId}/payments?limit=${limit}`,
  )
  return result.data || []
}

/**
 * Busca detalhes de uma assinatura.
 */
export async function getAsaasSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return fetchAsaas<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}

/**
 * Cancela uma assinatura.
 */
export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  await fetchAsaas(`/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  })
}

// ==========================================
// Payments
// ==========================================

/**
 * Busca detalhes de um pagamento específico.
 */
export async function getAsaasPayment(paymentId: string): Promise<AsaasPayment> {
  return fetchAsaas<AsaasPayment>(`/payments/${paymentId}`)
}

export type { AsaasCustomer, AsaasSubscription, AsaasPayment, AsaasWebhookEvent }
