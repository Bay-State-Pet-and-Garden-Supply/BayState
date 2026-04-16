"use client";

import { Search, X, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PipelineSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  isLoading?: boolean;
}

export function PipelineSearchField({
  value,
  onChange,
  placeholder = "Search SKUs or names...",
  className,
  inputClassName,
  isLoading = false,
}: PipelineSearchFieldProps) {
  return (
    <div className={cn("relative group", className)}>
      {isLoading ? (
        <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-brand-forest-green" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand-forest-green" />
      )}
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 bg-background pl-9 pr-8 border-muted-foreground/20 focus-visible:ring-brand-forest-green/30",
          inputClassName,
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-2.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
