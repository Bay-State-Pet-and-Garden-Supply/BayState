import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runExtractionQualityEval } from "../src/evals/extraction-quality/runner";

const outputDir = path.join(os.tmpdir(), `research-agent-extraction-eval-${Date.now()}`);
const datasetPath = path.resolve(import.meta.dir, "../benchmarks/extraction-quality/fixtures/smoke-dataset.json");

afterAll(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe("runExtractionQualityEval", () => {
  it("scores merged extracted facts against expected field-level truth", async () => {
    const { report, jsonPath, markdownPath } = await runExtractionQualityEval({
      datasetPath,
      outputDir,
    });

    expect(report.summary.totalEntries).toBe(2);
    expect(report.summary.overallPassRate).toBe(1);
    expect(report.summary.requiredImagesPassRate).toBe(1);
    expect(report.summary.forbiddenImagesPassRate).toBe(1);
    expect(report.summary.imageCountPassRate).toBe(1);
    expect(report.summary.titlePassRate).toBe(1);

    const fromm = report.entries.find((entry) => entry.id === "fromm-gallery-quality");
    expect(fromm?.actual.images).toHaveLength(2);
    expect(fromm?.actual.images.some((image) => image.includes("duck-stew-front"))).toBe(true);
    expect(fromm?.actual.images.some((image) => image.includes("duck-stew-back"))).toBe(true);
    expect(fromm?.actual.images.some((image) => image.includes("chicken-stew-front"))).toBe(false);

    const firstmate = report.entries.find((entry) => entry.id === "firstmate-jsonld-quality");
    expect(firstmate?.actual.title).toBe("FirstMate Chicken Meal with Blueberries Formula Cat 3.96lb");
    expect(firstmate?.attributeScore).toBe(1);
    expect(firstmate?.actual.images).toHaveLength(2);

    expect(Bun.file(jsonPath).size).toBeGreaterThan(0);
    expect(Bun.file(markdownPath).size).toBeGreaterThan(0);
  });
});
