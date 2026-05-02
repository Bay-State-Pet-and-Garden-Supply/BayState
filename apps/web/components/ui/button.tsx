import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-xs font-black uppercase tracking-[0.15em] transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-0 focus-visible:border-primary focus-visible:border-2 active:scale-[0.98] border border-border",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive",
        outline:
          "bg-background hover:bg-muted text-foreground",
        secondary:
          "bg-brand-gold text-brand-burgundy hover:bg-brand-gold/80 border-brand-gold",
        ghost:
          "border-transparent hover:bg-muted text-foreground active:scale-100 hover:translate-x-0 hover:translate-y-0",
        link: "border-transparent text-brand-forest-green underline-offset-4 hover:underline active:scale-100 hover:translate-x-0 hover:translate-y-0",
      },
      size: {
        default: "h-[--size-btn-height-default] px-4 py-2 has-[>svg]:px-3",
        sm: "h-[--size-btn-height-sm] gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-[--size-btn-height-lg] px-6 has-[>svg]:px-4",
        icon: "size-[--size-btn-height-icon]",
        "icon-sm": "size-[--size-btn-height-icon-sm]",
        "icon-lg": "size-[--size-btn-height-icon-lg]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "default", asChild = false, ...props },
    ref
  ) {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)

export { Button, buttonVariants }
