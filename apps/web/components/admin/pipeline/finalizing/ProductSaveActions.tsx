"use client";

import { Package, RotateCcw, Save, CheckCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProductSaveActionsProps {
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
    <div className="border-b border-border bg-card p-4 flex-shrink-0 z-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Package className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold text-foreground line-clamp-1"
              title={originalName || productName || ""}
            >
              {originalName || productName || "Untitled Product"}
            </h2>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="rounded-sm bg-muted border border-border px-1.5 py-0.5 font-semibold text-foreground">
                {selectedSku}
              </span>
              <span>•</span>
              <span className="font-bold text-foreground">
                ${Number(productPrice || 0).toFixed(2)}
              </span>
            </div>
          </div>
          {isDirty ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-brand-gold bg-brand-gold/10 text-[10px] font-semibold text-brand-burgundy rounded-sm animate-pulse"
            >
              Unsaved Changes
            </Badge>
          ) : null}
          {saving ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-border bg-muted/50 text-[10px] font-semibold text-foreground rounded-sm"
            >
              Saving...
            </Badge>
          ) : null}
          {hasPendingCopilotReview ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border border-primary/20 bg-primary/5 text-[10px] font-semibold text-primary rounded-sm"
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
              className="rounded-sm font-semibold text-muted-foreground hover:text-foreground transition-all"
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
              className="rounded-sm font-semibold transition-all"
            >
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Draft
                </>
              )}
            </Button>
            <Button
              size="sm"
              className="rounded-sm bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all"
              onClick={onPublish}
              disabled={saving || publishing || hasPendingCopilotReview}
            >
              {publishing ? (
                "Publishing..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Publish
                </>
              )}
            </Button>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground/60">
            Shortcuts: Save with Cmd/Ctrl+S. Publish with Cmd/Ctrl+Enter.
          </p>
        </div>
      </div>
    </div>
  );
}
