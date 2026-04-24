"use client";

import { Package, RotateCcw, Save, CheckCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ProductSaveActionsProps {
  productName: string;
  originalName: string;
  productPrice: string;
  selectedSku: string | null;
  isDirty: boolean;
  hasPendingCopilotReview: boolean;
  saving: boolean;
  publishing: boolean;
  rejecting: boolean;
  onSave: () => void;
  onPublish: () => void;
  onReject: () => void;
  copilotTrigger?: React.ReactNode;
}

export function ProductSaveActions({
  productName,
  originalName,
  productPrice,
  selectedSku,
  isDirty,
  hasPendingCopilotReview,
  saving,
  publishing,
  rejecting,
  onSave,
  onPublish,
  onReject,
  copilotTrigger,
}: ProductSaveActionsProps) {
  return (
    <div className="border-b border-zinc-950 bg-white p-4 flex-shrink-0 z-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Package className="h-5 w-5 text-zinc-400 shrink-0" />
          <div className="min-w-0">
            <h2
              className="text-lg font-black uppercase tracking-tighter text-zinc-950 line-clamp-1"
              title={originalName || productName || ""}
            >
              {originalName || productName || "Untitled Product"}
            </h2>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
              <span className="rounded-none bg-zinc-100 border border-zinc-950 px-1 font-black uppercase tracking-tighter text-zinc-950">
                {selectedSku}
              </span>
              <span>•</span>
              <span className="font-black text-zinc-950 uppercase tracking-tighter">
                ${Number(productPrice || 0).toFixed(2)}
              </span>
            </div>
          </div>
          {isDirty ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-zinc-950 bg-amber-100 text-[9px] font-black uppercase tracking-tighter text-amber-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] animate-pulse"
            >
              Unsaved Changes
            </Badge>
          ) : null}
          {saving ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-zinc-950 bg-zinc-100 text-[9px] font-black uppercase tracking-tighter text-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)]"
            >
              Saving...
            </Badge>
          ) : null}
          {hasPendingCopilotReview ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-zinc-950 bg-violet-100 text-[9px] font-black uppercase tracking-tighter text-violet-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)]"
            >
              Copilot Review Pending
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {copilotTrigger}
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={
                saving || publishing || rejecting || hasPendingCopilotReview
              }
              className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
            >
              {rejecting ? (
                "Returning..."
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Return to Scraped
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={saving || publishing || hasPendingCopilotReview}
              className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter text-zinc-950 hover:bg-zinc-100 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
            >
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
            <Button
              size="sm"
              className="rounded-none border border-zinc-950 bg-zinc-950 text-white shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter hover:bg-zinc-800 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
              onClick={onPublish}
              disabled={saving || publishing || hasPendingCopilotReview}
            >
              {publishing ? (
                "Queueing..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
          </div>
          <p className="text-[10px] font-black uppercase tracking-tighter text-zinc-400">
            Shortcuts: Save with Cmd/Ctrl+S. Approve with Cmd/Ctrl+Enter.
          </p>
        </div>
      </div>
    </div>
  );
}
