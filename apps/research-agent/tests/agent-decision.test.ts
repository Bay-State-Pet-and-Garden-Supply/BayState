import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attachAgentDecisionToReport } from "../src/research/agent-decision";
import { runProductResearch } from "../src/research/runProductResearch";
import { type ProductResearchReport, productResearchReportSchema } from "../src/schemas/ProductResearchReport";
import { rewriteStoredResearchArtifacts, writeResearchArtifacts } from "../src/storage/artifact-store";

const tempRoot = path.join(os.tmpdir(), `research-agent-decision-${Date.now()}`);

const exampleInput = {
  productId: "fromm-cat-purrsnick-duck-stew-3oz",
  upc: "072705113446",
  registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  brand: "Fromm",
  officialWebsiteUrl: "https://frommfamily.com",
  seedCandidateUrls: [
    {
      url: "https://frommfamily.com/products/cat/purrsnickitty/can",
      sourceType: "serp" as const,
      title: "PurrSnickitty - Wet Food for Cats",
      snippet: "Fromm Family Foods PurrSnickitty wet cat food landing page.",
    },
    {
      url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
      sourceType: "serp" as const,
      title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
      snippet:
        "SKU: 072705113446 Categories: CAT CANS, CAT/KITTEN Brand: FROMM FAMILY FO. Description. 12/3OZ PURRSNICK DUCK STEW.",
    },
  ],
};

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function createStoredReport(): Promise<ProductResearchReport> {
  const report = await runProductResearch(exampleInput, {
    runId: "decision-test-run",
    now: new Date("2026-05-26T23:30:00.000Z"),
  });

  return writeResearchArtifacts(report, exampleInput, {
    artifactRoot: tempRoot,
  });
}

describe("attachAgentDecisionToReport", () => {
  it("attaches a selected candidate decision to the report schema", async () => {
    const storedReport = await createStoredReport();
    const updated = attachAgentDecisionToReport(
      storedReport,
      {
        selectedUrl:
          "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
        rationale: "Exact UPC and variant match outweigh the generic official page.",
        confidence: 0.8,
        defer: false,
      },
      { recordedAt: new Date("2026-05-26T23:31:00.000Z") },
    );

    expect(updated.agentDecision?.selectedUrl).toBe(
      "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
    );
    expect(updated.agentDecision?.source).toBe("pi_harness");
    expect(productResearchReportSchema.parse(updated)).toEqual(updated);
  });

  it("allows a deferred decision with no selected URL", async () => {
    const storedReport = await createStoredReport();
    const updated = attachAgentDecisionToReport(storedReport, {
      rationale: "The evidence remains ambiguous between a generic official page and an off-domain exact match.",
      defer: true,
      confidence: 0.42,
    });

    expect(updated.agentDecision?.defer).toBe(true);
    expect(updated.agentDecision?.selectedUrl).toBeUndefined();
  });

  it("rejects unknown candidate URLs", async () => {
    const storedReport = await createStoredReport();

    expect(() =>
      attachAgentDecisionToReport(storedReport, {
        selectedUrl: "https://example.com/not-a-candidate",
        rationale: "Invalid candidate.",
        defer: false,
      }),
    ).toThrow("selectedUrl must match one of the report candidate URLs");
  });

  it("rejects blank rationales", async () => {
    const storedReport = await createStoredReport();

    expect(() =>
      attachAgentDecisionToReport(storedReport, {
        selectedUrl:
          "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
        rationale: "   ",
        defer: false,
      }),
    ).toThrow();
  });

  it("rewrites stored report artifacts with embedded agent decision", async () => {
    const storedReport = await createStoredReport();
    const updated = attachAgentDecisionToReport(storedReport, {
      selectedUrl:
        "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
      rationale: "Exact UPC and variant evidence support the retailer URL.",
      confidence: 0.77,
      defer: false,
    });

    await rewriteStoredResearchArtifacts(updated);

    const reportJson = await Bun.file(updated.artifacts!.reportPath).text();
    const summary = await Bun.file(updated.artifacts!.summaryPath).text();
    const storefrontProductJson = await Bun.file(updated.artifacts!.storefrontProductPath!).text();

    expect(reportJson).toContain('"agentDecision"');
    expect(reportJson).toContain('"source": "pi_harness"');
    expect(summary).toContain("## Agent Decision");
    expect(summary).toContain("Exact UPC and variant evidence support the retailer URL.");
    expect(summary).toContain("Storefront Readiness");
    expect(storefrontProductJson).toContain('"agentDecisionUrl"');
    expect(storefrontProductJson).toContain("ticknersonline.drexelweb.com");
  });
});
