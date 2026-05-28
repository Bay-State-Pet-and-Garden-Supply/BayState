import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSerperStrategyEval } from "../src/evals/serper-strategy/runner";

const outputDir = path.join(os.tmpdir(), `research-agent-serper-eval-${Date.now()}`);
const datasetPath = path.resolve(import.meta.dir, "../benchmarks/serper-strategy/fixtures/smoke-dataset.json");

afterAll(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe("runSerperStrategyEval", () => {
  it("evaluates the staged SERP strategy against curated predicted-name and URL truth", async () => {
    const { report, jsonPath, markdownPath } = await runSerperStrategyEval({
      datasetPath,
      outputDir,
    });

    expect(report.summary.totalEntries).toBe(6);
    expect(report.summary.stagedQueryPassRate).toBe(1);
    expect(report.summary.predictedNamePassRate).toBe(1);
    expect(report.summary.topOfficialUrlPassRate).toBe(1);
    expect(report.summary.overallPassRate).toBe(1);

    const fromm = report.entries.find((entry) => entry.id === "fromm-purrsnickitty-duck-stew-3oz");
    expect(fromm?.actualQueries).toEqual([
      '"072705113446"',
      "site:frommfamily.com PurrSnickitty Cat Duck Stew 3 oz",
    ]);
    expect(fromm?.actualPredictedName).toBe("PurrSnickitty Cat Duck Stew 3 oz");
    expect(fromm?.topOfficialCandidateUrl).toBe("https://frommfamily.com/products/cat/purrsnickitty-duck-stew-3-oz");

    const firstmate = report.entries.find((entry) => entry.id === "firstmate-chicken-blueberries-cat-3-96lb");
    expect(firstmate?.actualPredictedName).toBe("Chicken Meal with Blueberries Formula Cat 3.96lb");
    expect(firstmate?.topOfficialCandidateUrl).toBe("https://firstmate.com/product/chicken-meal-with-blueberries-formula-for-cats");

    const drMarty = report.entries.find((entry) => entry.id === "dr-marty-natures-feast-poultry-12oz");
    expect(drMarty?.actualPredictedName).toBe("Dr Marty Nature's Feast Freeze Dried Cat Food, Essential Wellness ... 12 oz");
    expect(drMarty?.topOfficialCandidateUrl).toBe("https://drmartypets.com/product/natures-feast-poultry");

    const weruva = report.entries.find((entry) => entry.id === "weruva-paw-lickin-chicken-1oz");
    expect(weruva?.actualPredictedName).toBe("Weruva Paw Lickin' Chicken Freeze Dried Grain Free Cat Food 1 oz");
    expect(weruva?.topOfficialCandidateUrl).toBe("https://www.weruva.com/products/paw-lickin-chicken-freeze-dried-cat");

    const frommDuckLiver = report.entries.find((entry) => entry.id === "fromm-purrsnickitty-duck-liver-pate-3oz");
    expect(frommDuckLiver?.actualPredictedName).toBe("Fromm PurrSnickitty Duck Liver Pate Wet Cat Food Can, 3-oz 3 oz");
    expect(frommDuckLiver?.topOfficialCandidateUrl).toBe("https://frommfamily.com/products/cat/purrsnickitty/can/duck-liver-pate");

    const lakeValley = report.entries.find((entry) => entry.id === "lake-valley-seed-lemon-catnip-heirloom");
    expect(lakeValley?.actualPredictedName).toBe("Lake Valley Catnip Lemon Scented Seed");
    expect(lakeValley?.topOfficialCandidateUrl).toBe("https://lakevalleyseed.com/product/item-681-catnip-lemon-scented");

    expect(Bun.file(jsonPath).size).toBeGreaterThan(0);
    expect(Bun.file(markdownPath).size).toBeGreaterThan(0);
  });
});
