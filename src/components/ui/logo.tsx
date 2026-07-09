import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  href?: string
}

export function Logo({ className, href }: LogoProps) {
  const img = (
    <Image
      src="/logo.png"
      alt="PeladaPro"
      width={180}
      height={48}
      priority
      className={cn(
        "h-auto w-[128px] sm:w-[150px] md:w-[180px] object-contain transition-opacity duration-200 hover:opacity-90",
        className,
      )}
    />
  )

  if (href) {
    return (
      <Link href={href} className="flex items-center shrink-0">
        {img}
      </Link>
    )
  }

  return (
    <div className="flex items-center shrink-0">
      {img}
    </div>
  )
}
