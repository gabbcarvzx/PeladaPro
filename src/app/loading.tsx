import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="text-4xl animate-bounce">⚽</div>
        <Skeleton className="h-4 w-48 mx-auto" />
        <Skeleton className="h-3 w-32 mx-auto" />
      </div>
    </div>
  )
}
