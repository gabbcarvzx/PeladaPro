"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSupabase } from "@/lib/supabase/supabase-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/ui/logo"
import { PageTransition, FadeIn } from "@/components/layout/motion-wrapper"
import { toast } from "@/components/ui/toaster"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { AvatarPlaceholder } from "@/components/ui/avatar-placeholder"
import {
  Loader2,
  ArrowLeft,
  Shield,
  ShieldOff,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react"

interface UserRow {
  id: string
  email: string
  nome: string
  avatar_url: string | null
  role: "user" | "admin"
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const { supabase, user, loading: authLoading } = useSupabase()
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalAdmins, setTotalAdmins] = useState(0)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login")
      return
    }
    if (!authLoading && user) {
      checkAccess()
    }
  }, [user, authLoading, router])

  const checkAccess = async () => {
    try {
      // Busca o email do usuário logado
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, role")
        .eq("id", user!.id)
        .single()

      const p = profile as { email?: string; role?: string } | null
      const isSuper = p?.email === "gabrielcarvalhourspessoal@gmail.com"

      setIsSuperAdmin(isSuper)
      setCheckingAccess(false)

      if (isSuper) {
        loadUsers()
      }
    } catch {
      setCheckingAccess(false)
    }
  }

  const loadUsers = async () => {
    setLoadingUsers(true)
    const { data } = await supabase
      .from("profiles")
      .select("id, email, nome, avatar_url, role, created_at")
      .order("created_at", { ascending: false })

    const usersData = (data as UserRow[]) || []
    setUsers(usersData)
    setTotalUsers(usersData.length)
    setTotalAdmins(usersData.filter((u) => u.role === "admin").length)
    setLoadingUsers(false)
  }

  const handleUpdateRole = useCallback(async (userId: string, newRole: "admin" | "user") => {
    if (newRole === "user") {
      const confirmed = window.confirm(
        "Tem certeza que deseja remover este usuário como admin?",
      )
      if (!confirmed) return
    }

    setUpdatingUserId(userId)

    try {
      const response = await fetch("/api/admin/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao atualizar role")
      }

      toast({
        title: "Role atualizada!",
        description: data.message,
        variant: "success",
      })

      // Atualiza localmente
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      )
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setUpdatingUserId(null)
    }
  }, [])

  // Filtro de busca
  const filteredUsers = users.filter((u) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      u.nome?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term)
    )
  })

  if (authLoading || checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center border-[#ff5252]/20">
          <CardHeader>
            <div className="text-5xl mb-4">🔒</div>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Esta página é exclusiva para o super administrador do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button variant="gradient">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[68px] items-center justify-between md:min-h-[76px]">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Logo />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageTransition>
          <FadeIn>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-6 w-6 text-[#00e676]" />
                  <h1 className="text-2xl font-bold text-[#fafafa]">Painel Administrativo</h1>
                </div>
                <p className="text-sm text-[#6b7280]">
                  Gerencie os administradores do sistema.
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                    <UserCog className="h-5 w-5 text-[#00e676]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#6b7280]">Total de Usuários</p>
                    <p className="text-2xl font-bold text-[#fafafa]">{totalUsers}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#00e676]/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-[#00e676]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#6b7280]">Administradores</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold text-[#fafafa]">{totalAdmins}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#00e676]/10 text-[#00e676]">
                        {totalUsers > 0 ? Math.round((totalAdmins / totalUsers) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
                placeholder="Buscar por nome ou email..."
              />
            </div>

            {/* Users Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCog className="h-5 w-5 text-[#00e676]" />
                  Usuários
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-sm text-[#6b7280]">
                    {searchTerm ? "Nenhum usuário encontrado para esta busca." : "Nenhum usuário cadastrado."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#2a2a2a]">
                          <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Usuário
                          </th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider hidden sm:table-cell">
                            Email
                          </th>
                          <th className="text-center px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Role
                          </th>
                          <th className="text-right px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2a2a]">
                        {filteredUsers.map((u, i) => (
                          <motion.tr
                            key={u.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-[#121212] transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {u.avatar_url ? (
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={u.avatar_url} />
                                  </Avatar>
                                ) : (
                                  <AvatarPlaceholder name={u.nome} size="sm" />
                                )}
                                <span className="text-sm font-medium text-[#fafafa]">
                                  {u.nome || "Sem nome"}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#6b7280] hidden sm:table-cell">
                              {u.email}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${
                                  u.role === "admin"
                                    ? "bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20"
                                    : "bg-[#2a2a2a] text-[#6b7280] border border-[#2a2a2a]"
                                }`}
                              >
                                {u.role === "admin" ? (
                                  <Shield className="h-3 w-3" />
                                ) : (
                                  <ShieldOff className="h-3 w-3" />
                                )}
                                {u.role === "admin" ? "Admin" : "User"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {updatingUserId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary ml-auto" />
                              ) : u.role === "admin" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateRole(u.id, "user")}
                                  className="text-[#ff5252] hover:text-[#ff5252] hover:bg-[#ff5252]/10 text-xs"
                                >
                                  <ShieldOff className="mr-1 h-3.5 w-3.5" />
                                  Remover Admin
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateRole(u.id, "admin")}
                                  className="text-[#00e676] hover:text-[#00e676] hover:bg-[#00e676]/10 text-xs"
                                >
                                  <Shield className="mr-1 h-3.5 w-3.5" />
                                  Tornar Admin
                                </Button>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </PageTransition>
      </main>
    </div>
  )
}
