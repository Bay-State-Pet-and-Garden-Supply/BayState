import { describe, expect, it } from "@jest/globals";
import type { FinalizationDraft } from "@/lib/pipeline/finalization-draft";
import {
  filterPendingCopilotDraftReview,
  restorePendingCopilotDraftReview,
  stagePendingCopilotDraftReview,
} from "@/lib/pipeline/finalization-copilot-review";

const draftA: FinalizationDraft = {
  name: "Alpha Seeds",
  description: "",
  longDescription: "",
  price: "1.99",
  weight: "",
  brandId: "none",
  customSourceUrl: "",
  sources: [],
  stockStatus: "in_stock",
  availability: "in stock",
  minimumQuantity: "0",
  searchKeywords: "",
  gtin: "",
  productOnPages: ["Garden"],
  isSpecialOrder: false,
  customImageUrl: "",
  selectedImages: ["https://cdn.example.com/alpha.jpg"],
};

const draftB: FinalizationDraft = {
  ...draftA,
  name: "Beta Seed Packet",
  price: "2.99",
  productOnPages: ["Garden", "Seeds"],
  selectedImages: ["https://cdn.example.com/beta.jpg"],
};

describe("finalization copilot review helpers", () => {
  it("captures original drafts once and accumulates staged summaries", () => {
    const first = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsBySku: {
        "SKU-A": draftA,
        "SKU-B": draftB,
      },
      targetSkus: ["SKU-A"],
      summary: "Prepared a name update for SKU-A.",
    });

    const second = stagePendingCopilotDraftReview({
      pendingReview: first,
      draftsBySku: {
        "SKU-A": {
          ...draftA,
          name: "Alpha Seed Packet",
        },
        "SKU-B": draftB,
      },
      targetSkus: ["SKU-A", "SKU-B"],
      summary: "Prepared a page update for SKU-A and SKU-B.",
    });

    expect(second.skus).toEqual(["SKU-A", "SKU-B"]);
    expect(second.previousDrafts["SKU-A"]).toEqual(draftA);
    expect(second.previousDrafts["SKU-B"]).toEqual(draftB);
    expect(second.summaries).toEqual([
      "Prepared a name update for SKU-A.",
      "Prepared a page update for SKU-A and SKU-B.",
    ]);
  });

  it("restores staged drafts back to their original state", () => {
    const pendingReview = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsBySku: {
        "SKU-A": draftA,
      },
      targetSkus: ["SKU-A"],
      summary: "Prepared a rewrite for SKU-A.",
    });

    const restored = restorePendingCopilotDraftReview(
      {
        "SKU-A": {
          ...draftA,
          name: "Seed Packet",
          selectedImages: [],
        },
      },
      pendingReview,
    );

    expect(restored["SKU-A"]).toEqual(draftA);
  });

  it("keeps only failed SKUs after a partial accept", () => {
    const pendingReview = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsBySku: {
        "SKU-A": draftA,
        "SKU-B": draftB,
      },
      targetSkus: ["SKU-A", "SKU-B"],
      summary: "Prepared bulk edits.",
    });

    expect(filterPendingCopilotDraftReview(pendingReview, ["SKU-B"])).toEqual({
      skus: ["SKU-B"],
      previousDrafts: {
        "SKU-B": draftB,
      },
      summaries: ["Prepared bulk edits."],
    });
    expect(filterPendingCopilotDraftReview(pendingReview, [])).toBeNull();
  });
});
