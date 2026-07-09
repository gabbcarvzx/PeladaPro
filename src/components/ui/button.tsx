import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e676] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#00e676] text-[#0a0a0a] font-semibold shadow-sm hover:bg-[#00c853] hover:shadow-md hover:shadow-[#00e676]/20",
        destructive:
          "bg-[#ff5252] text-white shadow-sm hover:bg-red-600 hover:shadow-md",
        outline:
          "border border-[#2a2a2a] bg-transparent shadow-sm hover:bg-[#1a1a1a] hover:text-[#fafafa]",
        secondary:
          "bg-[#1a1a1a] text-[#a3a3a3] shadow-sm hover:bg-[#242424] hover:text-[#fafafa] hover:shadow-md",
        ghost:
          "hover:bg-[#1a1a1a] hover:text-[#fafafa]",
        link:
          "text-[#00e676] underline-offset-4 hover:underline",
        gradient:
          "bg-gradient-to-r from-[#00e676] to-[#00c853] text-[#0a0a0a] font-semibold shadow-sm hover:shadow-md hover:shadow-[#00e676]/25 hover:scale-[1.02]",
        glow:
          "bg-[#00e676] text-[#0a0a0a] font-semibold shadow-[0_0_20px_rgba(0,230,118,0.25)] hover:shadow-[0_0_30px_rgba(0,230,118,0.4)] hover:scale-[1.02] transition-all",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
