import { describe, expect, it } from "@jest/globals";
import type { FinalizationDraft } from "@/lib/pipeline/reviewing-draft";
import {
  filterPendingCopilotDraftReview,
  restorePendingCopilotDraftReview,
  stagePendingCopilotDraftReview,
} from "@/lib/pipeline/reviewing-copilot-review";

const draftA: FinalizationDraft = {
  name: "Alpha Seeds",
  description: "",
  price: "1.99",
  weight: "",
  brandId: "none",
  brandName: "",
  category: "",
  customSourceUrl: "",
  sources: {},
  stockStatus: "in_stock",
  availability: "in stock",
  minimumQuantity: "0",
  searchKeywords: "",
  gtin: "",
  petType: "",
  lifeStage: "",
  petSize: "",
  specialDiet: "",
  healthFeature: "",
  foodForm: "",
  flavor: "",
  productFeature: "",
  size: "",
  color: "",
  packagingType: "",
  inStorePickup: false,
  isSpecialOrder: false,
  customImageUrl: "",
  selectedImages: ["https://cdn.example.com/alpha.jpg"],
};

const draftB: FinalizationDraft = {
  ...draftA,
  name: "Beta Seed Packet",
  price: "2.99",
  selectedImages: ["https://cdn.example.com/beta.jpg"],
};

describe("reviewing copilot review helpers", () => {
  it("captures original drafts once and accumulates staged summaries", () => {
    const first = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsByUpc: {
        "UPC-A": draftA,
        "UPC-B": draftB,
      },
      targetUpcs: ["UPC-A"],
      summary: "Prepared a name update for UPC-A.",
    });

    const second = stagePendingCopilotDraftReview({
      pendingReview: first,
      draftsByUpc: {
        "UPC-A": {
          ...draftA,
          name: "Alpha Seed Packet",
        },
        "UPC-B": draftB,
      },
      targetUpcs: ["UPC-A", "UPC-B"],
      summary: "Prepared a page update for UPC-A and UPC-B.",
    });

    expect(second.upcs).toEqual(["UPC-A", "UPC-B"]);
    expect(second.previousDrafts["UPC-A"]).toEqual(draftA);
    expect(second.previousDrafts["UPC-B"]).toEqual(draftB);
    expect(second.summaries).toEqual([
      "Prepared a name update for UPC-A.",
      "Prepared a page update for UPC-A and UPC-B.",
    ]);
  });

  it("restores staged drafts back to their original state", () => {
    const pendingReview = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsByUpc: {
        "UPC-A": draftA,
      },
      targetUpcs: ["UPC-A"],
      summary: "Prepared a rewrite for UPC-A.",
    });

    const restored = restorePendingCopilotDraftReview(
      {
        "UPC-A": {
          ...draftA,
          name: "Seed Packet",
          selectedImages: [],
        },
      },
      pendingReview,
    );

    expect(restored["UPC-A"]).toEqual(draftA);
  });

  it("keeps only failed UPCs after a partial accept", () => {
    const pendingReview = stagePendingCopilotDraftReview({
      pendingReview: null,
      draftsByUpc: {
        "UPC-A": draftA,
        "UPC-B": draftB,
      },
      targetUpcs: ["UPC-A", "UPC-B"],
      summary: "Prepared bulk edits.",
    });

    expect(filterPendingCopilotDraftReview(pendingReview, ["UPC-B"])).toEqual({
      upcs: ["UPC-B"],
      previousDrafts: {
        "UPC-B": draftB,
      },
      summaries: ["Prepared bulk edits."],
    });
    expect(filterPendingCopilotDraftReview(pendingReview, [])).toBeNull();
  });
});
