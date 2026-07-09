import type { SupabaseClient } from "@supabase/supabase-js"
import type { Subscription, Pelada } from "@/types"

export class SubscriptionService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ==========================================
  // VERIFICAÇÕES DE ACESSO
  // ==========================================

  /**
   * Verifica se o usuário tem uma assinatura ativa (considerando grace period)
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const { data } = await this.supabase.rpc("can_create_pelada", {
      p_user_id: userId,
    })
    return data === true
  }

  /**
   * Verifica se o usuário pode gerenciar uma pelada específica
   * (admin + assinatura ativa + pelada não bloqueada)
   */
  async canManagePelada(userId: string, peladaId: string): Promise<boolean> {
    const { data } = await this.supabase.rpc("can_manage_pelada", {
      p_user_id: userId,
      p_pelada_id: peladaId,
    })
    return data === true
  }

  /**
   * Lança erro se o usuário não puder criar pelada
   */
  async assertCanCreatePelada(userId: string): Promise<void> {
    const allowed = await this.hasActiveSubscription(userId)
    if (!allowed) {
      throw new Error(
        "Você precisa de uma assinatura ativa para criar peladas. " +
        "Assine o plano de R$ 30,00/mês para desbloquear esta funcionalidade."
      )
    }
  }

  /**
   * Lança erro se o usuário não puder gerenciar a pelada
   */
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
  // ASSINATURA
  // ==========================================

  /**
   * Busca a assinatura do usuário
   */
  async getSubscription(userId: string): Promise<Subscription | null> {
    const { data } = await this.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    return data as Subscription | null
  }

  /**
   * Retorna o status da assinatura do usuário a partir do profile
   */
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

  /**
   * Bloqueia todas as peladas de um criador
   */
  async blockCreatorPeladas(userId: string): Promise<void> {
    await this.supabase.rpc("block_creator_peladas", {
      p_user_id: userId,
    })
  }

  /**
   * Desbloqueia todas as peladas de um criador
   */
  async unblockCreatorPeladas(userId: string): Promise<void> {
    await this.supabase.rpc("unblock_creator_peladas", {
      p_user_id: userId,
    })
  }

  /**
   * Verifica se uma pelada está bloqueada
   */
  async isPeladaBlocked(peladaId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("peladas")
      .select("is_blocked")
      .eq("id", peladaId)
      .single()

    return (data as any)?.is_blocked === true
  }

  /**
   * Busca informações de bloqueio de uma pelada
   */
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

  /**
   * Calcula dias restantes de tolerância
   */
  static getDiasRestantes(graceUntil: string | null): number {
    if (!graceUntil) return 0
    const grace = new Date(graceUntil).getTime()
    const agora = Date.now()
    const diff = grace - agora
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  /**
   * Formata status da assinatura para exibição
   */
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
