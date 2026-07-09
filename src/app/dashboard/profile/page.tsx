"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { AuthService } from "@/services/auth-service"
import {
  User,
  Mail,
  Shield,
  Shirt,
  Camera,
  Loader2,
  ArrowLeft,
  Save,
  LogOut,
} from "lucide-react"
import Link from "next/link"

export default function ProfilePage() {
  const router = useRouter()
  const { supabase, user, profile, loading, refreshProfile } = useSupabase()
  const authService = new AuthService(supabase)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nome, setNome] = useState("")
  const [numeroFavorito, setNumeroFavorito] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (profile) {
      setNome(profile.nome || "")
      setNumeroFavorito(profile.numero_favorito?.toString() || "")
      setAvatarPreview(null)
    }
  }, [profile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    try {
      await authService.updateProfile(user.id, {
        nome,
        numero_favorito: numeroFavorito ? parseInt(numeroFavorito) : null,
      })

      await refreshProfile()
      toast({
        title: "Perfil atualizado!",
        variant: "success",
      })
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Preview local
    const reader = new FileReader()
    reader.onload = (e) => setAvatarPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      await authService.uploadAvatar(user.id, file)
      await refreshProfile()
      toast({
        title: "Avatar atualizado!",
        variant: "success",
      })
    } catch (error) {
      toast({
        title: "Erro ao enviar avatar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
      setAvatarPreview(null)
    } finally {
      setUploading(false)
    }
  }

    const handleLogout = async () => {
    await authService.logout()
    toast({ title: "Até logo!" })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Logo />
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle>Meu Perfil</CardTitle>
                <CardDescription>
                  Gerencie suas informações pessoais e avatar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Avatar Section */}
                  <div className="flex flex-col items-center gap-4 lg:w-64">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="relative"
                    >
                      {avatarPreview || profile?.avatar_url ? (
                        <Avatar className="w-32 h-32 ring-4 ring-primary/20">
                          <AvatarImage
                            src={avatarPreview || profile?.avatar_url || undefined}
                            alt={profile?.nome}
                          />
                        </Avatar>
                      ) : (
                        <AvatarPlaceholder name={profile?.nome} size="xl" className="ring-4 ring-primary/20" />
                      )}

                      {/* Upload overlay */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:bg-primary-dark transition-all hover:scale-110 disabled:opacity-50"
                      >
                        {uploading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Camera className="h-5 w-5" />
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                    </motion.div>

                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">
                        Clique no ícone para trocar a foto
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG ou WEBP até 2MB
                      </p>
                    </div>

                    {/* Info Cards */}
                    <div className="w-full space-y-3 mt-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm font-medium truncate max-w-[180px]">
                            {user?.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Tipo</p>
                          <p className="text-sm font-medium capitalize">
                            {profile?.tipo === "mensalista" ? "Mensalista" : "Diarista"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit Form */}
                  <div className="flex-1">
                    <form onSubmit={handleSave} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="nome">Nome completo</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="nome"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            className="pl-10"
                            placeholder="Seu nome"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="numero">Número favorito</Label>
                        <div className="relative">
                          <Shirt className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="numero"
                            type="number"
                            min={0}
                            max={99}
                            value={numeroFavorito}
                            onChange={(e) => setNumeroFavorito(e.target.value)}
                            className="pl-10"
                            placeholder="Ex: 10"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Número da camisa (0-99)
                        </p>
                      </div>

                      <div className="pt-4 flex gap-3">
                        <Button type="submit" variant="gradient" disabled={saving}>
                          {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salvar alterações
                        </Button>
                        <Link href="/dashboard">
                          <Button type="button" variant="outline">
                            Cancelar
                          </Button>
                        </Link>
                      </div>
                    </form>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </PageTransition>
      </main>
    </div>
  )
}
