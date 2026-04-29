import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-semibold tracking-normal [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,background-color,border-color]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-brand-burgundy text-white [a&]:hover:bg-brand-burgundy/90 focus-visible:ring-brand-burgundy/20 dark:focus-visible:ring-brand-burgundy/40",
        success:
          "bg-brand-forest-green text-white [a&]:hover:bg-brand-forest-green/90 focus-visible:ring-brand-forest-green/20 dark:focus-visible:ring-brand-forest-green/40",
        warning:
          "bg-brand-gold text-brand-burgundy [a&]:hover:bg-brand-gold/90 focus-visible:ring-brand-gold/20 dark:focus-visible:ring-brand-gold/40",
        outline:
          "bg-white text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }
