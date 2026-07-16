import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * PermissionService — Verifica permissões baseadas em role.
 *
 * Regras:
 * - Usuário com role='admin' no banco tem permissão total
 * - Super admin fixo (gabrielcarvalhourspessoal@gmail.com) é
 *   sempre tratado como admin, mesmo que o banco tenha role='user'
 * - Usuários comuns só podem entrar em peladas e confirmar presença
 *
 * Admins são definidos manualmente via Painel Admin (/admin).
 */
const SUPER_ADMIN_EMAIL = "gabrielcarvalhourspessoal@gmail.com"

export class PermissionService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ==========================================
  // SUPER ADMIN
  // ==========================================

  /**
   * Verifica se o email do usuário é o super admin fixo.
   * Server-side: nunca confiar apenas no frontend.
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single()

    const profile = data as { email?: string } | null
    return profile?.email === SUPER_ADMIN_EMAIL
  }

  // ==========================================
  // VERIFICAÇÕES DE ROLE
  // ==========================================

  /**
   * Verifica se o usuário tem permissão de admin.
   * Considera:
   * 1. Se a role no banco é 'admin'
   * 2. Se o email é do super admin fixo
   */
  async isAdmin(userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("profiles")
      .select("role, email")
      .eq("id", userId)
      .single()

    const profile = data as { role?: string; email?: string } | null
    if (!profile) return false

    // Super admin sempre é admin
    if (profile.email === SUPER_ADMIN_EMAIL) return true

    // Role no banco
    return profile.role === "admin"
  }

  /**
   * Verifica se o usuário pode criar peladas (apenas admin).
   * Equivalente ao antigo hasActiveSubscription.
   */
  async canCreatePelada(userId: string): Promise<boolean> {
    const logTag = "[PERM-CAN-CREATE-PELADA]"
    try {
      const { data, error } = await this.supabase.rpc("can_create_pelada", {
        p_user_id: userId,
      })

      if (!error && data !== null) {
        return data === true
      }

      if (error) {
        console.warn(`${logTag} RPC falhou: ${error.message}, usando fallback`)
      }
    } catch (e) {
      console.warn(`${logTag} Exceção no RPC, usando fallback:`, e)
    }

    return this.isAdmin(userId)
  }

  /**
   * Verifica se o usuário pode gerenciar uma pelada específica.
   * Equivalente ao antigo canManagePelada.
   */
  async canManagePelada(userId: string, peladaId: string): Promise<boolean> {
    const logTag = "[PERM-CAN-MANAGE-PELADA]"
    try {
      const { data, error } = await this.supabase.rpc("can_manage_pelada", {
        p_user_id: userId,
        p_pelada_id: peladaId,
      })

      if (!error && data !== null) {
        return data === true
      }

      if (error) {
        console.warn(`${logTag} RPC falhou: ${error.message}, usando fallback`)
      }
    } catch (e) {
      console.warn(`${logTag} Exceção no RPC, usando fallback:`, e)
    }

    // Fallback: verifica se é admin da pelada e tem role admin
    console.warn(`${logTag} Usando fallback para userId=${userId}, peladaId=${peladaId}`)
    const { data: pelada } = await this.supabase
      .from("peladas")
      .select("admin_id")
      .eq("id", peladaId)
      .single()

    const p = pelada as { admin_id: string } | null
    if (!p) {
      console.warn(`${logTag} Pelada não encontrada`)
      return false
    }
    if (p.admin_id !== userId) {
      console.warn(`${logTag} Usuário ${userId} não é admin da pelada ${peladaId}`)
      return false
    }

    return this.isAdmin(userId)
  }

  /**
   * Verifica se o usuário tem role admin e lança erro se não tiver.
   * Usado para criar peladas.
   */
  async assertCanCreatePelada(userId: string): Promise<void> {
    const allowed = await this.canCreatePelada(userId)
    if (!allowed) {
      throw new Error(
        "A criação de peladas é exclusiva para administradores. " +
        "Entre em contato pelo WhatsApp para se tornar um admin."
      )
    }
  }

  /**
   * Verifica se o usuário AUTENTICADO pode gerenciar uma pelada e lança erro se não puder.
   * Obtém o userId do client autenticado (bypassa problema de caller passar userId errado).
   * Usado para editar pelada, gerenciar participantes, confrontos, etc.
   */
  async assertCanManagePelada(peladaId: string): Promise<void> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser()

    if (authError || !user) {
      throw new Error("Usuário não autenticado")
    }

    const allowed = await this.canManagePelada(user.id, peladaId)
    if (!allowed) {
      throw new Error(
        "Você não tem permissão para gerenciar esta pelada. " +
        "Apenas administradores podem gerenciar peladas."
      )
    }
  }
}
