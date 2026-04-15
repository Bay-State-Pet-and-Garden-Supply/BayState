"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ offset: offsetProp, mobileOffset: mobileOffsetProp, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const pathname = usePathname()
  const isPipelineRoute = pathname?.startsWith("/admin/pipeline") ?? false
  const offset = offsetProp ?? (isPipelineRoute ? { bottom: 120, right: 32 } : undefined)
  const mobileOffset = mobileOffsetProp ?? (isPipelineRoute ? { bottom: 144, right: 16 } : undefined)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: false,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      offset={offset}
      mobileOffset={mobileOffset}
      {...props}
    />
  )
}

export { Toaster }
