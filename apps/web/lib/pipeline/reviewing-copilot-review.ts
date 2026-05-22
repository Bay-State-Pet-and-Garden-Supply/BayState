import {
  EMPTY_FINALIZATION_DRAFT,
  type FinalizationDraft,
} from "@/lib/pipeline/reviewing-draft";

export interface PendingCopilotDraftReview {
  upcs: string[];
  previousDrafts: Record<string, FinalizationDraft>;
  summaries: string[];
}

function cloneFinalizationDraft(
  draft: FinalizationDraft,
): FinalizationDraft {
  return {
    ...draft,
    selectedImages: [...draft.selectedImages],
  };
}

export function stagePendingCopilotDraftReview({
  pendingReview,
  draftsByUpc,
  targetUpcs,
  summary,
}: {
  pendingReview: PendingCopilotDraftReview | null;
  draftsByUpc: Record<string, FinalizationDraft>;
  targetUpcs: string[];
  summary: string;
}): PendingCopilotDraftReview {
  const normalizedUpcs = Array.from(
    new Set(targetUpcs.map((upc) => upc.trim()).filter((upc) => upc.length > 0)),
  );

  if (normalizedUpcs.length === 0) {
    throw new Error("No products matched the requested scope.");
  }

  const previousDrafts = { ...(pendingReview?.previousDrafts ?? {}) };
  normalizedUpcs.forEach((upc) => {
    if (!previousDrafts[upc]) {
      previousDrafts[upc] = cloneFinalizationDraft(
        draftsByUpc[upc] ?? EMPTY_FINALIZATION_DRAFT,
      );
    }
  });

  const nextSummaries = [...(pendingReview?.summaries ?? [])];
  const trimmedSummary = summary.trim();
  if (trimmedSummary) {
    nextSummaries.push(trimmedSummary);
  }

  return {
    upcs: Array.from(new Set([...(pendingReview?.upcs ?? []), ...normalizedUpcs])),
    previousDrafts,
    summaries: nextSummaries,
  };
}

export function restorePendingCopilotDraftReview(
  draftsByUpc: Record<string, FinalizationDraft>,
  pendingReview: PendingCopilotDraftReview,
): Record<string, FinalizationDraft> {
  const nextDrafts = { ...draftsByUpc };

  Object.entries(pendingReview.previousDrafts).forEach(([upc, draft]) => {
    nextDrafts[upc] = cloneFinalizationDraft(draft);
  });

  return nextDrafts;
}

export function filterPendingCopilotDraftReview(
  pendingReview: PendingCopilotDraftReview,
  upcsToKeep: string[],
): PendingCopilotDraftReview | null {
  const keepSet = new Set(
    upcsToKeep.map((upc) => upc.trim()).filter((upc) => upc.length > 0),
  );
  const nextUpcs = pendingReview.upcs.filter((upc) => keepSet.has(upc));

  if (nextUpcs.length === 0) {
    return null;
  }

  return {
    upcs: nextUpcs,
    previousDrafts: Object.fromEntries(
      Object.entries(pendingReview.previousDrafts).filter(([upc]) =>
        keepSet.has(upc),
      ),
    ),
    summaries: [...pendingReview.summaries],
  };
}
