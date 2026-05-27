import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runProductResearch } from "../research/runProductResearch";
import { writeResearchArtifacts } from "../storage/artifact-store";
import { runAgentResearch, type ResearchAgentThinkingLevel } from "../pi/standalone";
import { loadLiveSampleInputs, type LoadLiveSampleInputsOptions } from "./sample-inputs";
import {
  writeDecisionSummaryArtifacts,
  type LiveSampleRunResult,
} from "./decision-summary";

export interface RunLiveSamplesOptions extends LoadLiveSampleInputsOptions {
  outputDir?: string;
  agent?: boolean;
  model?: string;
  thinkingLevel?: ResearchAgentThinkingLevel;
  agentHome?: string;
  useScraper?: boolean;
  pipeline?: "local" | "legacy-scraper";
  verboseAgent?: boolean;
  pageAcquisition?: "http" | "agent-browser" | "auto" | "none";
  indexing?: "off" | "lookup-only" | "refresh-stale" | "cold-start";
}

export interface RunLiveSamplesResult {
  outputDir: string;
  sampleInputsPath: string;
  resultsPath: string;
  warningsPath: string;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  results: LiveSampleRunResult[];
}

export async function runLiveSamples(
  options: RunLiveSamplesOptions = {},
): Promise<RunLiveSamplesResult> {
  const outputDir = path.resolve(options.outputDir ?? path.join("artifacts", "live-smoke"));
  await mkdir(outputDir, { recursive: true });

  const { inputs, warnings } = await loadLiveSampleInputs(options);
  const sampleInputsPath = path.join(outputDir, "sample-inputs.json");
  const warningsPath = path.join(outputDir, "sample-input-warnings.json");
  const resultsPath = path.join(outputDir, "live-sample-results.json");

  await writeFile(sampleInputsPath, `${JSON.stringify(inputs, null, 2)}\n`, "utf8");
  await writeFile(warningsPath, `${JSON.stringify(warnings, null, 2)}\n`, "utf8");

  const results: LiveSampleRunResult[] = [];
  const pipeline = options.pipeline ?? (options.useScraper ? "legacy-scraper" : "local");

  for (const input of inputs) {
    try {
      if (options.agent) {
        const result = await runAgentResearch(input, {
          useScraper: pipeline === "legacy-scraper",
          outputDir,
          model: options.model,
          thinkingLevel: options.thinkingLevel,
          agentHome: options.agentHome,
          invocationCwd: process.cwd(),
          printEvents: options.verboseAgent ?? false,
          printAssistantText: options.verboseAgent ?? false,
        });

        results.push({
          upc: input.upc ?? input.productId,
          productId: input.productId,
          brand: input.brand,
          reportStatus: result.report.status,
          selectedCanonicalUrl: result.report.selectedCanonicalUrl,
          agentSelectedUrl: result.agentDecision?.selectedUrl,
          agentDeferred: result.agentDecision?.defer,
          agentDecisionConfidence: result.agentDecision?.confidence,
          warningCount: result.report.warnings.length,
          warningMessages: result.report.warnings,
        });
      } else {
        let report;
        if (pipeline === "legacy-scraper") {
          report = await runProductResearch(input);
        } else {
          const { runProductResearchV2 } = await import("../research/runProductResearchV2");
          const result = await runProductResearchV2(input, {
            pageAcquisition: options.pageAcquisition ?? "auto",
            indexing: options.indexing ?? "cold-start",
          });
          report = result.report;
        }
        const stored = await writeResearchArtifacts(report, input, { artifactRoot: outputDir });
        results.push({
          upc: input.upc ?? input.productId,
          productId: input.productId,
          brand: input.brand,
          reportStatus: stored.status,
          selectedCanonicalUrl: stored.selectedCanonicalUrl,
          warningCount: stored.warnings.length,
          warningMessages: stored.warnings,
        });
      }
    } catch (error) {
      results.push({
        upc: input.upc ?? input.productId,
        productId: input.productId,
        brand: input.brand,
        warningCount: 0,
        warningMessages: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  const summaryArtifacts = await writeDecisionSummaryArtifacts(outputDir, results);

  return {
    outputDir,
    sampleInputsPath,
    resultsPath,
    warningsPath,
    summaryJsonPath: summaryArtifacts.summaryJsonPath,
    summaryMarkdownPath: summaryArtifacts.summaryMarkdownPath,
    results,
  };
}
