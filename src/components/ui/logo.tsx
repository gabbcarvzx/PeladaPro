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
      width={100}
      height={48}
      sizes="(max-width: 768px) 40px, 48px"
      className={cn(
        "h-10 md:h-12 w-auto object-contain transition-opacity duration-200 hover:opacity-90",
        className,
      )}
      priority
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
