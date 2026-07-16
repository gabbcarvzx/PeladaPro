import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Proxy — Next.js 16.
 *
 * Next.js 16 substituiu "middleware.ts" por "proxy.ts".
 * A exportação deve ser nomeada como "proxy" (não "middleware").
 * - Protege rotas autenticadas (dashboard, peladas)
 * - Redireciona usuários logados para fora do login
 */
export async function proxy(request: NextRequest) {
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

  const protectedPrefixes = ["/dashboard", "/pelada/create", "/pelada/sorteio", "/pelada/ao-vivo", "/pelada/dia-de-jogo", "/admin", "/jogador"]
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

    // Preserva a URL original para redirect pós-login
    const originalPath = request.nextUrl.pathname + request.nextUrl.search
    url.searchParams.set("next", originalPath)

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

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, manifest, and other public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
