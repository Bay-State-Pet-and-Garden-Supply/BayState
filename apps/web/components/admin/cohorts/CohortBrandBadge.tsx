"use client";

import { useState } from "react";
import { Tag, Edit2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CohortBrandBadgeProps {
  cohortId: string;
  brandName: string | null;
  onAssign: (cohortId: string, brandName: string) => Promise<void>;
  className?: string;
}

export function CohortBrandBadge({
  cohortId,
  brandName,
  onAssign,
  className = "",
}: CohortBrandBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isEditing) {
    return (
      <div className={`flex items-center gap-1 ${className}`} onClick={(e) => e.stopPropagation()}>
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder="Enter brand name..."
          className="h-7 w-36 text-xs px-2 bg-background border-brand-forest-green/30 focus-visible:ring-brand-forest-green"
          autoFocus
          disabled={isSubmitting}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && editValue.trim() && !isSubmitting) {
              setIsSubmitting(true);
              try {
                await onAssign(cohortId, editValue.trim());
                setIsEditing(false);
              } finally {
                setIsSubmitting(false);
              }
            }
            if (e.key === "Escape") {
              setIsEditing(false);
            }
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 hover:bg-green-50 hover:text-green-600"
          disabled={isSubmitting || !editValue.trim()}
          onClick={async (e) => {
            e.stopPropagation();
            setIsSubmitting(true);
            try {
              await onAssign(cohortId, editValue.trim());
              setIsEditing(false);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
          disabled={isSubmitting}
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(false);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (brandName) {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-brand-forest-green/10 text-brand-forest-green border border-brand-forest-green/20 hover:bg-brand-forest-green/20 transition-all cursor-pointer ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setEditValue(brandName);
          setIsEditing(true);
        }}
      >
        <Tag className="h-3.5 w-3.5" />
        {brandName}
        <Edit2 className="h-3 w-3 opacity-60 ml-0.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-brand-forest-green/60 hover:text-brand-forest-green hover:bg-brand-forest-green/5 transition-all cursor-pointer bg-transparent ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        setEditValue("");
        setIsEditing(true);
      }}
    >
      <Tag className="h-3.5 w-3.5" />
      Assign Brand
    </button>
  );
}
