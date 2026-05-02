"use client";

import { FormEvent, useState } from "react";
import { ExternalLink, Loader2, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type {
  OfficialBrandCandidateReviewItem,
  OfficialBrandSkuReview,
} from "@/lib/official-brand-review-types";

interface CandidateUrlPickerProps {
  skuReview: OfficialBrandSkuReview;
  officialDomains: string[];
  preferredDomains: string[];
  isSaving: boolean;
  pendingCandidateKey: string | null;
  onSelectCandidate: (candidate: OfficialBrandCandidateReviewItem) => void;
  onRejectCandidate: (candidate: OfficialBrandCandidateReviewItem) => void;
  onAddManualUrl: (url: string) => Promise<boolean>;
}

function domainMatches(domain: string, candidates: string[]): boolean {
  return candidates.some(
    (candidate) => domain === candidate || domain.endsWith(`.${candidate}`),
  );
}

function getDomainBadge(
  candidate: OfficialBrandCandidateReviewItem,
  officialDomains: string[],
  preferredDomains: string[],
) {
  if (domainMatches(candidate.normalized_domain, officialDomains)) {
    return {
      label: "Official",
      className:
        "border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green",
    };
  }

  if (domainMatches(candidate.normalized_domain, preferredDomains)) {
    return {
      label: "Preferred",
      className: "border-brand-gold bg-brand-gold/20 text-brand-burgundy",
    };
  }

  return {
    label: "Organic",
    className: "border-border bg-muted/40 text-muted-foreground",
  };
}

function formatScore(value: number | null): string {
  return value === null ? "No score" : value.toFixed(1);
}

function formatConfidence(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}% confidence`;
}

function formatTier(value: string | null): string {
  return value ? value.replace(/_/g, " ") : "untiered";
}

export function CandidateUrlPicker({
  skuReview,
  officialDomains,
  preferredDomains,
  isSaving,
  pendingCandidateKey,
  onSelectCandidate,
  onRejectCandidate,
  onAddManualUrl,
}: CandidateUrlPickerProps) {
  const [manualUrl, setManualUrl] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const selectedCandidate = skuReview.candidates.find(
    (candidate) => candidate.selection_status === "selected",
  );

  const handleAddManualUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUrl = manualUrl.trim();
    if (!nextUrl) {
      return;
    }

    setIsAddingUrl(true);
    try {
      const added = await onAddManualUrl(nextUrl);
      if (added) {
        setManualUrl("");
      }
    } finally {
      setIsAddingUrl(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <RadioGroup
        value={selectedCandidate?.normalized_url ?? ""}
        onValueChange={(value) => {
          const candidate = skuReview.candidates.find(
            (entry) => entry.normalized_url === value,
          );
          if (candidate) {
            onSelectCandidate(candidate);
          }
        }}
        className="min-h-0 flex-1 gap-3 overflow-y-auto pr-1"
      >
        {skuReview.candidates.length === 0 ? (
          <div className="rounded-none border border-dashed border-border bg-muted/10 p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
              No Candidates Found
            </h3>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Discovery did not return a URL for this SKU. Paste a product page URL below to keep extraction moving.
            </p>
          </div>
        ) : (
          skuReview.candidates.map((candidate) => {
            const domainBadge = getDomainBadge(
              candidate,
              officialDomains,
              preferredDomains,
            );
            const isSelected = candidate.selection_status === "selected";
            const isRejected = candidate.selection_status === "rejected";
            const isExtracted = candidate.selection_status === "extracted";
            const isFailed = candidate.selection_status === "failed";
            const pendingKey = `${candidate.sku}:${candidate.normalized_url}`;
            const isPending = pendingCandidateKey === pendingKey;

            return (
              <div
                key={candidate.id}
                className={cn(
                  "rounded-none border bg-card p-4 transition-colors",
                  isSelected && "border-primary bg-primary/5",
                  isRejected && "border-border bg-muted/20 opacity-60",
                  isExtracted && "border-brand-forest-green bg-brand-forest-green/5",
                  isFailed && "border-brand-burgundy bg-brand-burgundy/5",
                  !isSelected && !isRejected && !isExtracted && !isFailed && "border-border",
                )}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem
                    value={candidate.normalized_url}
                    disabled={isSaving || isAddingUrl}
                    className="mt-1 border-border text-primary data-[state=checked]:border-primary"
                    aria-label={`Select ${candidate.url}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <a
                        href={candidate.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 break-all text-sm font-bold text-primary underline-offset-4 hover:underline"
                      >
                        {candidate.url}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={domainBadge.className}>
                          {domainBadge.label}
                        </Badge>
                        <Badge variant="outline" className="bg-background text-foreground">
                          {candidate.candidate_source}
                        </Badge>
                        {isSelected ? <Badge variant="success">Current</Badge> : null}
                        {isExtracted ? <Badge variant="success">Extracted</Badge> : null}
                        {isRejected ? <Badge variant="outline">Rejected</Badge> : null}
                        {isFailed ? <Badge variant="destructive">Failed</Badge> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>{candidate.normalized_domain}</span>
                      <span>{formatTier(candidate.selection_tier)}</span>
                      <span>{formatScore(candidate.composite_score)}</span>
                      {formatConfidence(candidate.confidence) ? (
                        <span>{formatConfidence(candidate.confidence)}</span>
                      ) : null}
                      {candidate.rank ? <span>Rank {candidate.rank}</span> : null}
                      {candidate.appeared_in_phases ? (
                        <span>Phases {candidate.appeared_in_phases.join(", ")}</span>
                      ) : null}
                    </div>

                    {candidate.title ? (
                      <h4 className="text-sm font-black text-foreground">
                        {candidate.title}
                      </h4>
                    ) : null}
                    {candidate.snippet ? (
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {candidate.snippet}
                      </p>
                    ) : null}
                    {candidate.error_message ? (
                      <p className="rounded-none border border-brand-burgundy bg-brand-burgundy/5 p-2 text-xs font-bold text-brand-burgundy">
                        {candidate.error_message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex justify-end border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRejectCandidate(candidate)}
                    disabled={
                      isSaving ||
                      isAddingUrl ||
                      isRejected ||
                      isExtracted ||
                      isFailed
                    }
                    className="h-8 text-[10px]"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    Reject
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </RadioGroup>

      <form
        onSubmit={handleAddManualUrl}
        className="shrink-0 rounded-none border border-border bg-muted/10 p-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="Paste a product page URL"
            className="h-10 bg-background font-mono text-sm"
            disabled={isSaving || isAddingUrl}
          />
          <Button
            type="submit"
            disabled={!manualUrl.trim() || isSaving || isAddingUrl}
            className="h-10 sm:w-auto"
          >
            {isAddingUrl ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add URL
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Manual URLs are selected immediately and can point to any readable product page.
        </p>
      </form>
    </div>
  );
}
