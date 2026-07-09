import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  link?: string
  size?: "sm" | "md"
}

const sizeConfig = {
  sm: { width: 28, height: 28 },
  md: { width: 32, height: 32 },
}

export function Logo({ className, link, size = "md" }: LogoProps) {
  const img = (
    <Image
      src="/logo.png"
      alt="PeladaPro"
      width={sizeConfig[size].width}
      height={sizeConfig[size].height}
      className={cn(
        "object-contain transition-opacity duration-200 hover:opacity-90",
        className,
      )}
      priority
    />
  )

  if (link) {
    return (
      <Link href={link} className="flex items-center">
        {img}
      </Link>
    )
  }

  return img
}
