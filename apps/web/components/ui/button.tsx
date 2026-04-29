import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-zinc-300 bg-white text-sm font-semibold text-zinc-900 transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.99]",
  {
    variants: {
      variant: {
        default: "bg-primary text-white border-primary hover:bg-primary/92 hover:border-primary/90",
        destructive:
          "bg-brand-burgundy text-white border-brand-burgundy hover:bg-brand-burgundy/92 focus-visible:ring-brand-burgundy/20 dark:focus-visible:ring-brand-burgundy/40 dark:bg-brand-burgundy/60",
        outline:
          "bg-background text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-brand-gold text-brand-burgundy border-brand-gold hover:bg-brand-gold/85",
        ghost:
          "border-transparent bg-transparent hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-accent/50 active:scale-100",
        link: "border-transparent bg-transparent p-0 text-brand-forest-green underline-offset-4 hover:underline active:scale-100",
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
