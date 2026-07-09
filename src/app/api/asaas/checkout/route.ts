import { NextResponse } from "next/server"

/**
 * POST /api/asaas/checkout (DEPRECATED)
 *
 * Esta rota foi substituída por /api/asaas/create-subscription
 * que coleta CPF/CNPJ antes de criar a assinatura.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Esta rota foi desativada. Use /api/asaas/create-subscription para criar uma assinatura com CPF/CNPJ.",
    },
    { status: 410 },
  )
}
