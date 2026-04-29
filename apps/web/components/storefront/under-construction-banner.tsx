"use client";

import { ExternalLink, AlertTriangle } from "lucide-react";

/**
 * UnderConstructionBanner - A persistent banner to notify users that the site
 * is currently under construction and is not the official storefront yet.
 */
export function UnderConstructionBanner() {
  return (
    <div className="relative z-50 border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] px-4 py-2 text-zinc-700">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 md:text-base">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <span>Under Construction / Beta Preview</span>
        </div>

        <p className="text-xs md:text-sm font-medium max-w-2xl">
          Development preview. Visit our official site for orders.
        </p>

        <a
          href="https://www.baystatepet.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm transition-all hover:border-zinc-400 hover:bg-zinc-50"
        >
          <span>Official Site</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
