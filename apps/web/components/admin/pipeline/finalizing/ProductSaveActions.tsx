"use client";

import { Package, RotateCcw, Save, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="p-4 border-b flex justify-between items-center bg-card flex-shrink-0 z-10">
      <div className="flex items-center gap-3">
        <Package className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-bold tracking-tight line-clamp-1">
            {originalName || productName || "Untitled Product"}
          </h2>
          <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
            <span className="bg-muted px-1 rounded">{selectedSku}</span>
            <span>•</span>
            <span className="font-bold text-primary">
              ${Number(productPrice || 0).toFixed(2)}
            </span>
          </div>
        </div>
        {isDirty && (
          <Badge variant="outline" className="ml-2 h-5 text-[10px] font-normal border-amber-200 bg-amber-50 text-amber-700 animate-pulse">
            Unsaved Changes
          </Badge>
        )}
        {saving && (
          <Badge variant="outline" className="ml-2 h-5 text-[10px] font-normal border-primary/20 bg-primary/5 text-primary">
            Saving...
          </Badge>
        )}
        {hasPendingCopilotReview && (
          <Badge
            variant="outline"
            className="ml-2 h-5 text-[10px] font-normal border-violet-200 bg-violet-50 text-violet-700"
          >
            Copilot Review Pending
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={saving || publishing || rejecting || hasPendingCopilotReview}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
        >
          {rejecting ? (
            "Rejecting..."
          ) : (
            <>
              <RotateCcw className="h-4 w-4 mr-2" /> Reject to Scraped
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
              <Save className="h-4 w-4 mr-2" /> Save
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
                "Moving..."
              ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve & Move to Exporting
              </>
            )}
        </Button>
      </div>
    </div>
  );
}
