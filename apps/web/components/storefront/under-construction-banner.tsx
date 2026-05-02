"use client";

import { ExternalLink, AlertTriangle } from "lucide-react";

/**
 * UnderConstructionBanner - A persistent banner to notify users that the site
 * is currently under construction and is not the official storefront yet.
 */
export function UnderConstructionBanner() {
  return (
    <div className="bg-primary text-primary-foreground border-b-2 border-primary-foreground/30 py-1.5 px-4 relative z-30">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-2 font-display font-bold uppercase tracking-tight text-sm md:text-base">
          <AlertTriangle className="h-5 w-5 animate-pulse" />
          <span>Under Construction / Beta Preview</span>
        </div>

        <p className="text-xs md:text-sm font-medium max-w-2xl">
          Development preview. Visit our official site for orders.
        </p>

        <a
          href="https://www.baystatepet.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-semibold tracking-wide border border-[oklch(85%_0.03_160)] shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all shrink-0"
        >
          <span>Official Site</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
