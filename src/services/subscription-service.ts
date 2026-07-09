import type { SupabaseClient } from "@supabase/supabase-js"
import type { Pelada } from "@/types"

export class SubscriptionService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ==========================================
  // VERIFICAÇÕES DE ACESSO
  // ==========================================

  /**
   * Verifica se o usuário tem uma assinatura ativa.
   * Regra simples: status = 'active' AND now() < expires_at
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const { data } = await this.supabase.rpc("can_create_pelada", {
      p_user_id: userId,
    })
    if (!data) {
      // Se o RPC negou, verifica se precisa bloquear peladas
      await this.checkAndBlockIfExpired(userId)
    }
    return data === true
  }

  async canManagePelada(userId: string, peladaId: string): Promise<boolean> {
    const { data } = await this.supabase.rpc("can_manage_pelada", {
      p_user_id: userId,
      p_pelada_id: peladaId,
    })
    if (!data) {
      await this.checkAndBlockIfExpired(userId)
    }
    return data === true
  }

  async assertCanCreatePelada(userId: string): Promise<void> {
    const allowed = await this.hasActiveSubscription(userId)
    if (!allowed) {
      throw new Error(
        "Você precisa de uma assinatura ativa para criar peladas. " +
        "Assine o plano de R$ 30,00/mês para desbloquear esta funcionalidade."
      )
    }
  }

  async assertCanManagePelada(userId: string, peladaId: string): Promise<void> {
    const allowed = await this.canManagePelada(userId, peladaId)
    if (!allowed) {
      throw new Error(
        "Esta pelada está bloqueada para administração. " +
        "Regularize sua assinatura para reativar o acesso administrativo."
      )
    }
  }

  // ==========================================
  // BLOQUEIO/DESBLOQUEIO
  // ==========================================

  async blockCreatorPeladas(userId: string): Promise<void> {
    await this.supabase.rpc("block_creator_peladas", { p_user_id: userId })
  }

  async unblockCreatorPeladas(userId: string): Promise<void> {
    await this.supabase.rpc("unblock_creator_peladas", { p_user_id: userId })
  }

  /**
   * Verifica se a assinatura expirou e bloqueia as peladas se necessário.
   * Deve ser chamada sempre que o usuário tentar uma ação administrativa.
   */
  async checkAndBlockIfExpired(userId: string): Promise<void> {
    const details = await this.getSubscriptionDetails(userId)

    if (details.status === "active" && details.diasRestantes <= 0) {
      console.log(`[SUB] Assinatura expirada para ${userId} — bloqueando peladas`)
      await this.supabase
        .from("profiles")
        .update({ subscription_status: "expired" })
        .eq("id", userId)

      await this.blockCreatorPeladas(userId)
    }
  }

  async isPeladaBlocked(peladaId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("peladas")
      .select("is_blocked")
      .eq("id", peladaId)
      .single()
    return (data as any)?.is_blocked === true
  }

  async getPeladaBlockInfo(peladaId: string): Promise<{
    isBlocked: boolean
    blockedReason: string | null
    blockedAt: string | null
  }> {
    const { data } = await this.supabase
      .from("peladas")
      .select("is_blocked, blocked_reason, blocked_at")
      .eq("id", peladaId)
      .single()

    const row = data as any
    return {
      isBlocked: row?.is_blocked === true,
      blockedReason: row?.blocked_reason || null,
      blockedAt: row?.blocked_at || null,
    }
  }

  // ==========================================
  // DADOS DA ASSINATURA
  // ==========================================

  /**
   * Busca dados completos da assinatura para exibição na UI.
   */
  async getSubscriptionDetails(userId: string): Promise<{
    status: string
    expiresAt: string | null
    graceUntil: string | null
    lastPaymentAt: string | null
    planPrice: number
    diasRestantes: number
  }> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("subscription_status, subscription_expires_at, subscription_grace_until")
      .eq("id", userId)
      .single()

    const p = profile as any
    const status = p?.subscription_status || "none"
    const expiresAt = p?.subscription_expires_at || null
    const graceUntil = p?.subscription_grace_until || null

    // Último pagamento na tabela payments
    const { data: lastPayment } = await this.supabase
      .from("payments")
      .select("paid_at")
      .eq("user_id", userId)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Dias restantes: calcula a partir de expires_at (se ativo) ou grace_until (se tolerância)
    let diasRestantes = 0
    if (status === "active" && expiresAt) {
      diasRestantes = SubscriptionService.getDiasRestantes(expiresAt)
    } else if (status === "past_due" && graceUntil) {
      diasRestantes = SubscriptionService.getDiasRestantes(graceUntil)
    }

    return {
      status,
      expiresAt,
      graceUntil,
      lastPaymentAt: (lastPayment as any)?.paid_at || null,
      planPrice: 30.0,
      diasRestantes,
    }
  }

  async getUserSubscriptionStatus(userId: string): Promise<{
    status: string
    graceUntil: string | null
  }> {
    const { data } = await this.supabase
      .from("profiles")
      .select("subscription_status, subscription_grace_until")
      .eq("id", userId)
      .single()

    return {
      status: (data as any)?.subscription_status || "none",
      graceUntil: (data as any)?.subscription_grace_until || null,
    }
  }

  // ==========================================
  // UTILITÁRIOS
  // ==========================================

  static formatarData(isoString: string | null): string {
    if (!isoString) return "—"
    try {
      return new Date(isoString).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    } catch {
      return "—"
    }
  }

  static getDiasRestantes(dateStr: string | null): number {
    if (!dateStr) return 0
    const date = new Date(dateStr).getTime()
    const agora = Date.now()
    const diff = date - agora
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  static formatarStatus(status: string): string {
    const map: Record<string, string> = {
      none: "Sem assinatura",
      active: "Ativa",
      past_due: "Vencida",
      canceled: "Cancelada",
      expired: "Expirada",
      pending: "Pendente",
    }
    return map[status] || status
  }
}
