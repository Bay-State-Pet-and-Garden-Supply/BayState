"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [showInactive, setShowInactive] = useState(false);
  const selectedTabRef = useRef<HTMLButtonElement>(null);

  const selectableCandidates = useMemo(
    () =>
      skuReview.candidates.filter(
        (candidate) =>
          candidate.selection_status !== "rejected" &&
          candidate.selection_status !== "failed" &&
          candidate.selection_status !== "extracted",
      ),
    [skuReview.candidates],
  );

  const inactiveCandidates = useMemo(
    () =>
      skuReview.candidates.filter(
        (candidate) =>
          candidate.selection_status === "rejected" ||
          candidate.selection_status === "failed" ||
          candidate.selection_status === "extracted",
      ),
    [skuReview.candidates],
  );

  const selectedCandidate = skuReview.candidates.find(
    (candidate) => candidate.selection_status === "selected",
  );

  useEffect(() => {
    selectedTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedCandidate?.normalized_url]);

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

  const handlePrev = () => {
    if (!selectedCandidate || selectableCandidates.length <= 1) return;
    const idx = selectableCandidates.findIndex(
      (c) => c.normalized_url === selectedCandidate.normalized_url,
    );
    const prev =
      selectableCandidates[
        (idx - 1 + selectableCandidates.length) % selectableCandidates.length
      ];
    if (prev) onSelectCandidate(prev);
  };

  const handleNext = () => {
    if (!selectedCandidate || selectableCandidates.length <= 1) return;
    const idx = selectableCandidates.findIndex(
      (c) => c.normalized_url === selectedCandidate.normalized_url,
    );
    const next = selectableCandidates[(idx + 1) % selectableCandidates.length];
    if (next) onSelectCandidate(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {skuReview.candidates.length === 0 ? (
        <div className="rounded-none border border-dashed border-border bg-muted/10 p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
            No Candidates Found
          </h3>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Discovery did not return a URL for this SKU. Paste a product page
            URL below to keep extraction moving.
          </p>
        </div>
      ) : (
        <>
          {/* Candidate grid */}
          <div className="flex shrink-0 items-center gap-2 max-h-28 overflow-y-auto">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={selectableCandidates.length <= 1}
              onClick={handlePrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5">
              {selectableCandidates.map((candidate) => {
                const domainBadge = getDomainBadge(
                  candidate,
                  officialDomains,
                  preferredDomains,
                );
                const isSelected =
                  candidate.selection_status === "selected";
                return (
                  <button
                    key={candidate.id}
                    ref={isSelected ? selectedTabRef : undefined}
                    type="button"
                    onClick={() => onSelectCandidate(candidate)}
                    className={cn(
                      "flex flex-col items-start rounded-none border px-2 py-1.5 text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/[0.03] ring-1 ring-primary/20"
                        : "border-border/60 hover:border-border hover:bg-muted/20",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block rounded-none px-1 py-0 text-[8px] font-black uppercase tracking-widest leading-tight",
                        isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {domainBadge.label}
                    </span>
                    <span className="mt-1 w-full truncate text-[10px] font-black uppercase tracking-tight text-foreground">
                      {candidate.normalized_domain}
                    </span>
                    <span className="text-[9px] font-medium text-muted-foreground/80">
                      Score: {formatScore(candidate.composite_score)}
                    </span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={selectableCandidates.length <= 1}
              onClick={handleNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Detail card for selected candidate */}
          {selectedCandidate ? (
            <SelectedCandidateDetail
              candidate={selectedCandidate}
              officialDomains={officialDomains}
              preferredDomains={preferredDomains}
              isSaving={isSaving}
              pendingCandidateKey={pendingCandidateKey}
              onRejectCandidate={onRejectCandidate}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-none border border-dashed border-border bg-muted/10 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Use arrow keys or click a candidate above to select a URL.
              </p>
            </div>
          )}

          {/* Inactive candidates */}
          {inactiveCandidates.length > 0 && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setShowInactive((s) => !s)}
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground underline-offset-2 hover:underline"
              >
                {showInactive ? "Hide" : "Show"} Inactive ({inactiveCandidates.length})
              </button>
              {showInactive ? (
                <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                  {inactiveCandidates.map((candidate) => (
                    <InactiveCandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      officialDomains={officialDomains}
                      preferredDomains={preferredDomains}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <form
        onSubmit={handleAddManualUrl}
        className="shrink-0 rounded-none border border-border bg-muted/10 p-2"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="Paste a product page URL"
            className="h-8 bg-background font-mono text-sm"
            disabled={isSaving || isAddingUrl}
          />
          <Button
            type="submit"
            disabled={!manualUrl.trim() || isSaving || isAddingUrl}
            className="h-8 sm:w-auto"
          >
            {isAddingUrl ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add URL
          </Button>
        </div>
      </form>
    </div>
  );
}

function SelectedCandidateDetail({
  candidate,
  officialDomains,
  preferredDomains,
  isSaving,
  pendingCandidateKey,
  onRejectCandidate,
}: {
  candidate: OfficialBrandCandidateReviewItem;
  officialDomains: string[];
  preferredDomains: string[];
  isSaving: boolean;
  pendingCandidateKey: string | null;
  onRejectCandidate: (candidate: OfficialBrandCandidateReviewItem) => void;
}) {
  const domainBadge = getDomainBadge(
    candidate,
    officialDomains,
    preferredDomains,
  );
  const isRejected = candidate.selection_status === "rejected";
  const isExtracted = candidate.selection_status === "extracted";
  const isFailed = candidate.selection_status === "failed";
  const pendingKey = `${candidate.sku}:${candidate.normalized_url}`;
  const isPending = pendingCandidateKey === pendingKey;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-none border border-primary bg-primary/5 p-4">
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
          <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", domainBadge.className)}>
            {domainBadge.label}
          </Badge>
          <Badge variant="outline" className="bg-background px-1.5 py-0 text-[10px] text-muted-foreground">
            {candidate.candidate_source}
          </Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
        <h4 className="mt-3 text-sm font-black text-foreground">
          {candidate.title}
        </h4>
      ) : null}
      {candidate.snippet ? (
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {candidate.snippet}
        </p>
      ) : null}
      {candidate.error_message ? (
        <p className="mt-2 rounded-none border border-brand-burgundy bg-brand-burgundy/5 p-2 text-xs font-bold text-brand-burgundy">
          {candidate.error_message}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end border-t border-border/50 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRejectCandidate(candidate)}
          disabled={isSaving || isRejected || isExtracted || isFailed}
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
}

function InactiveCandidateRow({
  candidate,
  officialDomains,
  preferredDomains,
}: {
  candidate: OfficialBrandCandidateReviewItem;
  officialDomains: string[];
  preferredDomains: string[];
}) {
  const domainBadge = getDomainBadge(
    candidate,
    officialDomains,
    preferredDomains,
  );
  const isRejected = candidate.selection_status === "rejected";
  const isExtracted = candidate.selection_status === "extracted";
  const isFailed = candidate.selection_status === "failed";

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-none border px-3 py-2",
        isRejected && "border-border bg-muted/20 opacity-60",
        isExtracted && "border-brand-forest-green bg-brand-forest-green/5",
        isFailed && "border-brand-burgundy bg-brand-burgundy/5",
      )}
    >
      <a
        href={candidate.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate text-xs font-bold text-primary underline-offset-4 hover:underline"
      >
        {candidate.url}
      </a>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className={domainBadge.className}>
          {domainBadge.label}
        </Badge>
        {isRejected ? <Badge variant="outline">Rejected</Badge> : null}
        {isExtracted ? <Badge variant="success">Extracted</Badge> : null}
        {isFailed ? <Badge variant="destructive">Failed</Badge> : null}
      </div>
    </div>
  );
}
