"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Admin page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 rounded-full bg-brand-gold/10 p-4 ring-1 ring-brand-gold/20">
        <AlertTriangle className="h-10 w-10 text-brand-burgundy" />
      </div>

      <h2 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
        Admin Portal Error
      </h2>

      <p className="mb-8 max-w-[450px] text-muted-foreground leading-relaxed">
        An unexpected error occurred while loading this admin module. Data
        integrity protection is active.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={reset}
          size="lg"
          variant="default"
          className="gap-2 font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Action
        </Button>

        <Button variant="outline" size="lg" asChild className="gap-2">
          <Link href="/admin">
            <LayoutDashboard className="h-4 w-4" />
            Admin Dashboard
          </Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-12 font-mono text-xs text-muted-foreground/40 selection:bg-brand-gold/20">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
