import type { SupabaseClient } from "@supabase/supabase-js"
import type { Profile, ProfileUpdate } from "@/types"

export class AuthService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Faz logout e redireciona
   */
  async logout(redirectTo = "/") {
    await this.supabase.auth.signOut()
    if (typeof window !== "undefined") {
      window.location.href = redirectTo
    }
  }

  /**
   * Obtém o perfil do usuário logado
   */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    return data as Profile | null
  }

  /**
   * Atualiza o perfil do usuário (apenas campos permitidos)
   */
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile | null> {
    const { data } = await this.supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single()

    return data as Profile | null
  }

  /**
   * Upload de avatar para o Storage do Supabase
   */
  async uploadAvatar(userId: string, file: File): Promise<string | null> {
    const fileExt = file.name.split(".").pop()
    if (!fileExt) throw new Error("Arquivo sem extensão")
    
    const filePath = `avatars/${userId}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await this.supabase.storage
      .from("avatars")
      .upload(filePath, file)

    if (uploadError) {
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`)
    }

    const { data: urlData } = this.supabase.storage
      .from("avatars")
      .getPublicUrl(filePath)

    // Atualizar o profile com a nova URL do avatar
    await this.updateProfile(userId, { avatar_url: urlData.publicUrl })

    return urlData.publicUrl
  }

  /**
   * Busca jogadores pelo nome (para adicionar em peladas)
   */
  async searchPlayers(query: string): Promise<Profile[]> {
    const { data } = await this.supabase
      .from("profiles")
      .select("*")
      .ilike("nome", `%${query}%`)
      .limit(10)

    return (data as Profile[]) || []
  }
}
