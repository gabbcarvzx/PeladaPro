// ==========================================
// Asaas API Client — v3 Simplified
// ==========================================
// Documentação: https://docs.asaas.com
// Sandbox: https://api-sandbox.asaas.com/v3
// Produção: https://api.asaas.com/v3
//
// Fluxo SIMPLIFICADO (sem subscriptions):
// 1. POST /v3/customers    → cria customer
// 2. POST /v3/payments     → cria cobrança única → invoiceUrl
// 3. Redireciona para invoiceUrl
// 4. Webhook PAYMENT_RECEIVED → ativa por 30 dias

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

interface AsaasPayment {
  id: string
  customer: string
  value: number
  netValue: number
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED"
  dueDate: string
  invoiceUrl: string
  bankSlipUrl: string | null
  pixQrCode: string | null
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX"
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

    let message = "Erro na API Asaas"
    try {
      const parsed: AsaasApiError = JSON.parse(errorText)
      if (parsed.errors?.length > 0) {
        message = parsed.errors[0].description
      }
    } catch {
      message = errorText.slice(0, 200)
    }

    throw new Error(message)
  }

  return response.json()
}

// ==========================================
// Customers
// ==========================================

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

export async function updateAsaasCustomer(
  customerId: string,
  data: { cpfCnpj?: string; mobilePhone?: string; name?: string },
): Promise<AsaasCustomer> {
  return fetchAsaas<AsaasCustomer>(`/customers/${customerId}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ==========================================
// Payments (cobrança única)
// ==========================================

/** Cria cobrança única. Retorna invoiceUrl no response. */
export async function createAsaasPayment(data: {
  customer: string
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD"
  value: number
  dueDate: string
  description: string
}): Promise<AsaasPayment> {
  return fetchAsaas<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/** Busca detalhes de um pagamento pelo ID. */
export async function getAsaasPayment(paymentId: string): Promise<AsaasPayment> {
  return fetchAsaas<AsaasPayment>(`/payments/${paymentId}`)
}

export type { AsaasCustomer, AsaasPayment }
