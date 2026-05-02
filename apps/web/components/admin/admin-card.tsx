import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AdminCardProps {
  children: ReactNode;
  variant?: "surface" | "panel";
  className?: string;
}

export function AdminCard({
  children,
  variant = "surface",
  className,
}: AdminCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--surface-admin-radius)] border flex flex-col gap-4",
        variant === "surface" && "bg-[var(--surface-admin-card)] border-[var(--surface-admin-border)] p-4 sm:p-6",
        variant === "panel" && "bg-white border-[var(--surface-admin-border)] p-4 sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

interface AdminCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function AdminCardHeader({ children, className }: AdminCardHeaderProps) {
  return (
    <div className={cn("flex items-start gap-3", className)}>{children}</div>
  );
}

interface AdminCardTitleProps {
  children: ReactNode;
  className?: string;
}

export function AdminCardTitle({ children, className }: AdminCardTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </h2>
  );
}

interface AdminCardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function AdminCardDescription({
  children,
  className,
}: AdminCardDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}

interface AdminCardContentProps {
  children: ReactNode;
  className?: string;
}

export function AdminCardContent({
  children,
  className,
}: AdminCardContentProps) {
  return <div className={cn(className)}>{children}</div>;
}
