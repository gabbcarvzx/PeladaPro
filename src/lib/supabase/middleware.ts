import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Atualiza a sessão do usuário
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedPrefixes = ["/dashboard", "/pelada/create", "/pelada/join", "/pelada/sorteio"]
  // Protege qualquer rota /pelada/[id] ou /pelada/[id]/edit
  const isPeladaDynamic = /^\/pelada\/[^/]+(\/.*)?$/.test(request.nextUrl.pathname)
  const isProtectedPath = isPeladaDynamic || protectedPrefixes.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  )
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth/")

  // Proteger rotas que exigem autenticação
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // Redirecionar usuários logados da página de login para dashboard
  if (user && isAuthPage && !request.nextUrl.pathname.startsWith("/auth/callback")) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
