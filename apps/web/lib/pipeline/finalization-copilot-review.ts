import {
  EMPTY_FINALIZATION_DRAFT,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";

export interface PendingCopilotDraftReview {
  skus: string[];
  previousDrafts: Record<string, FinalizationDraft>;
  summaries: string[];
}

export function cloneFinalizationDraft(
  draft: FinalizationDraft,
): FinalizationDraft {
  return {
    ...draft,
    productOnPages: [...draft.productOnPages],
    selectedImages: [...draft.selectedImages],
  };
}

export function stagePendingCopilotDraftReview({
  pendingReview,
  draftsBySku,
  targetSkus,
  summary,
}: {
  pendingReview: PendingCopilotDraftReview | null;
  draftsBySku: Record<string, FinalizationDraft>;
  targetSkus: string[];
  summary: string;
}): PendingCopilotDraftReview {
  const normalizedSkus = Array.from(
    new Set(targetSkus.map((sku) => sku.trim()).filter((sku) => sku.length > 0)),
  );

  if (normalizedSkus.length === 0) {
    throw new Error("No products matched the requested scope.");
  }

  const previousDrafts = { ...(pendingReview?.previousDrafts ?? {}) };
  normalizedSkus.forEach((sku) => {
    if (!previousDrafts[sku]) {
      previousDrafts[sku] = cloneFinalizationDraft(
        draftsBySku[sku] ?? EMPTY_FINALIZATION_DRAFT,
      );
    }
  });

  const nextSummaries = [...(pendingReview?.summaries ?? [])];
  const trimmedSummary = summary.trim();
  if (trimmedSummary) {
    nextSummaries.push(trimmedSummary);
  }

  return {
    skus: Array.from(new Set([...(pendingReview?.skus ?? []), ...normalizedSkus])),
    previousDrafts,
    summaries: nextSummaries,
  };
}

export function restorePendingCopilotDraftReview(
  draftsBySku: Record<string, FinalizationDraft>,
  pendingReview: PendingCopilotDraftReview,
): Record<string, FinalizationDraft> {
  const nextDrafts = { ...draftsBySku };

  Object.entries(pendingReview.previousDrafts).forEach(([sku, draft]) => {
    nextDrafts[sku] = cloneFinalizationDraft(draft);
  });

  return nextDrafts;
}

export function filterPendingCopilotDraftReview(
  pendingReview: PendingCopilotDraftReview,
  skusToKeep: string[],
): PendingCopilotDraftReview | null {
  const keepSet = new Set(
    skusToKeep.map((sku) => sku.trim()).filter((sku) => sku.length > 0),
  );
  const nextSkus = pendingReview.skus.filter((sku) => keepSet.has(sku));

  if (nextSkus.length === 0) {
    return null;
  }

  return {
    skus: nextSkus,
    previousDrafts: Object.fromEntries(
      Object.entries(pendingReview.previousDrafts).filter(([sku]) =>
        keepSet.has(sku),
      ),
    ),
    summaries: [...pendingReview.summaries],
  };
}
