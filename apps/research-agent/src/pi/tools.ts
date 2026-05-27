import path from "node:path";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  KnownUrlCliScraperExtractionAdapter,
} from "../adapters/scraper-extraction";
import { runProductResearch } from "../research/runProductResearch";
import { runProductResearchV2 } from "../research/runProductResearchV2";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import { writeResearchArtifacts } from "../storage/artifact-store";

export interface AgentDecisionToolInput {
  selectedUrl?: string;
  rationale: string;
  confidence?: number;
  defer: boolean;
}

export interface BuildRunProductResearchToolOptions {
  rawInput: unknown;
  invocationCwd: string;
  defaultPipeline?: "local" | "legacy-scraper";
  defaultOutputDir?: string;
  onStoredReport?: (report: ProductResearchReport) => void | Promise<void>;
}

export function buildRunProductResearchTool(
  options: BuildRunProductResearchToolOptions,
) {
  return defineTool({
    name: "run_product_research",
    label: "Run product research",
    description:
      "Execute the deterministic BayState product research pipeline for the loaded input and write local artifacts.",
    promptSnippet:
      "run_product_research: run the local deterministic research workflow and return artifact paths.",
    promptGuidelines: [
      "Use run_product_research when the user wants the standalone research-agent harness to execute.",
      "Do not invent product fields; rely on the deterministic report returned by the tool.",
    ],
    parameters: Type.Object({
      pipeline: Type.Optional(
        Type.String({
          enum: ["local", "legacy-scraper"],
          description: "Which pipeline engine to use. local is native deterministic; legacy-scraper uses legacy Python scraper.",
        })
      ),
      pageAcquisition: Type.Optional(
        Type.String({
          enum: ["http", "agent-browser", "auto", "none"],
          description: "Which page acquisition strategy to use in local mode.",
        })
      ),
      useScraper: Type.Optional(
        Type.Boolean({
          description: "Deprecated: whether to call the legacy scraper-side extraction wrapper.",
        }),
      ),
      outputDir: Type.Optional(
        Type.String({
          description:
            "Optional artifact root. Relative paths are resolved from the command invocation directory.",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const pipeline = params.pipeline ?? (params.useScraper ? "legacy-scraper" : (options.defaultPipeline ?? "local"));
      const outputDir = params.outputDir
        ? path.resolve(options.invocationCwd, params.outputDir)
        : options.defaultOutputDir
          ? path.resolve(options.invocationCwd, options.defaultOutputDir)
          : undefined;

      let report: ProductResearchReport;

      if (pipeline === "legacy-scraper") {
        const legacyReport = await runProductResearch(options.rawInput, {
          extractionAdapter: new KnownUrlCliScraperExtractionAdapter(),
        });
        report = legacyReport;
      } else {
        const result = await runProductResearchV2(options.rawInput, {
          topN: 3,
          artifactRoot: outputDir,
          savePageArtifacts: true,
          pageAcquisition: (params.pageAcquisition as any) ?? "auto",
        });
        report = result.report;
      }

      const storedReport = await writeResearchArtifacts(report, options.rawInput, {
        artifactRoot: outputDir,
      });

      await options.onStoredReport?.(storedReport);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: storedReport.status,
                selectedCanonicalUrl: storedReport.selectedCanonicalUrl ?? null,
                overallConfidence: storedReport.confidence.overall,
                reportPath: storedReport.artifacts?.reportPath ?? null,
                summaryPath: storedReport.artifacts?.summaryPath ?? null,
                pipeline,
              },
              null,
              2,
            ),
          },
        ],
        details: {
          status: storedReport.status,
          selectedCanonicalUrl: storedReport.selectedCanonicalUrl ?? null,
          overallConfidence: storedReport.confidence.overall,
          reportPath: storedReport.artifacts?.reportPath ?? null,
          summaryPath: storedReport.artifacts?.summaryPath ?? null,
          pipeline,
        },
      };
    },
  });
}

export interface BuildRecordAgentDecisionToolOptions {
  getStoredReport: () => ProductResearchReport | undefined;
  onDecision?: (decision: AgentDecisionToolInput) => void | Promise<void>;
}

export function buildRecordAgentDecisionTool(
  options: BuildRecordAgentDecisionToolOptions,
) {
  return defineTool({
    name: "record_agent_decision",
    label: "Record candidate decision",
    description:
      "Record the Pi agent's final candidate choice or explicit defer decision after reviewing the deterministic research report.",
    promptSnippet:
      "record_agent_decision: save the Pi agent's final candidate selection or defer decision.",
    promptGuidelines: [
      "Call record_agent_decision exactly once after run_product_research.",
      "Choose a URL only if it is present in the report candidates and you can justify it from the evidence.",
      "Use defer=true when the report remains ambiguous and manual review is still warranted.",
    ],
    parameters: Type.Object({
      selectedUrl: Type.Optional(
        Type.String({
          description: "Chosen canonical URL from the report candidates. Omit when deferring.",
        }),
      ),
      rationale: Type.String({
        description: "Short evidence-based explanation for the choice or defer decision.",
      }),
      confidence: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 1,
          description: "Agent confidence in this decision from 0 to 1.",
        }),
      ),
      defer: Type.Optional(
        Type.Boolean({
          description: "Set true when the agent wants to leave the case in manual review.",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const storedReport = options.getStoredReport();
      if (!storedReport) {
        throw new Error("record_agent_decision cannot run before run_product_research.");
      }

      const defer = params.defer ?? !params.selectedUrl;
      const selectedUrl = params.selectedUrl?.trim() || undefined;
      const rationale = params.rationale.trim();
      const candidateUrls = new Set(storedReport.candidates.map((candidate) => candidate.normalizedUrl));

      if (!rationale) {
        throw new Error("rationale must not be empty.");
      }

      if (!defer && !selectedUrl) {
        throw new Error("selectedUrl is required unless defer=true.");
      }

      if (selectedUrl && !candidateUrls.has(selectedUrl)) {
        throw new Error("selectedUrl must match one of the report candidate URLs.");
      }

      const decision: AgentDecisionToolInput = {
        selectedUrl,
        rationale,
        confidence: params.confidence,
        defer,
      };

      await options.onDecision?.(decision);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(decision, null, 2),
          },
        ],
        details: decision,
      };
    },
  });
}
