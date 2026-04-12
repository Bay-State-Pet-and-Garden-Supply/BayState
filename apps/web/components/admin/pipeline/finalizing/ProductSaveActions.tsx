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
}: ProductSaveActionsProps) {
  return (
    <div className="border-b bg-card p-4 flex-shrink-0 z-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-bold tracking-tight line-clamp-1">
              {originalName || productName || "Untitled Product"}
            </h2>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1">{selectedSku}</span>
              <span>•</span>
              <span className="font-bold text-primary">
                ${Number(productPrice || 0).toFixed(2)}
              </span>
            </div>
          </div>
          {isDirty ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border-amber-200 bg-amber-50 text-[10px] font-normal text-amber-700 animate-pulse"
            >
              Unsaved Changes
            </Badge>
          ) : null}
          {saving ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border-primary/20 bg-primary/5 text-[10px] font-normal text-primary"
            >
              Saving...
            </Badge>
          ) : null}
          {hasPendingCopilotReview ? (
            <Badge
              variant="outline"
              className="ml-2 h-5 border-violet-200 bg-violet-50 text-[10px] font-normal text-violet-700"
            >
              Copilot Review Pending
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={
                saving || publishing || rejecting || hasPendingCopilotReview
              }
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
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
              className="bg-primary hover:bg-primary/90"
              onClick={onPublish}
              disabled={saving || publishing || hasPendingCopilotReview}
            >
              {publishing ? (
                "Queueing..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve & Queue for Export
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Shortcuts: Save with Cmd/Ctrl+S. Approve with Cmd/Ctrl+Enter.
          </p>
        </div>
      </div>
    </div>
  );
}
