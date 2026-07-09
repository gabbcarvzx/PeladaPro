import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { AsaasService } from "@/services/asaas-service"

/**
 * POST /api/asaas/checkout
 * 
 * Gera URL de checkout Asaas para o usuário autenticado.
 * Esta rota é server-side e pode acessar process.env.ASAAS_API_KEY com segurança.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verifica autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Busca o perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Gera checkout via AsaasService (server-side apenas)
    const asaasService = new AsaasService(supabase)
    const url = await asaasService.generateCheckout(
      user.id,
      user.email || (profile as any).email,
      (profile as any).nome,
    )

    return NextResponse.json({ url })
  } catch (error) {
    console.error("[CHECKOUT API] Erro:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao gerar checkout",
      },
      { status: 500 },
    )
  }
}
