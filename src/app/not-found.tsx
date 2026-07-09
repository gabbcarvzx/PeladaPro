import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚽</div>
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-xl font-semibold mb-2">Página não encontrada</p>
        <p className="text-muted-foreground mb-6">
          A página que você está procurando não existe ou foi removida.
        </p>
        <Link href="/">
          <Button variant="gradient">
            <Home className="mr-2 h-4 w-4" />
            Voltar ao Início
          </Button>
        </Link>
      </div>
    </div>
  )
}
