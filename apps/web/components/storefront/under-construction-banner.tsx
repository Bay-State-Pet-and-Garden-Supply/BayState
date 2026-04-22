"use client";

import { ExternalLink, AlertTriangle } from "lucide-react";

/**
 * UnderConstructionBanner - A persistent banner to notify users that the site
 * is currently under construction and is not the official storefront yet.
 */
export function UnderConstructionBanner() {
  return (
    <div className="bg-accent text-accent-foreground border-b-4 border-zinc-900 py-1.5 px-4 relative z-50">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-2 font-display font-black uppercase tracking-tighter text-sm md:text-base">
          <AlertTriangle className="h-5 w-5 animate-pulse" />
          <span>Under Construction / Beta Preview</span>
        </div>

        <p className="text-xs md:text-sm font-medium max-w-2xl">
          This is a development preview of our new website. Some features may be
          incomplete. For official orders and information, please visit our
          current site.
        </p>

        <a
          href="https://www.baystatepet.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-1.5 text-xs font-black uppercase tracking-tighter border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all shrink-0"
        >
          <span>Official Site</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
