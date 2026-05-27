import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import { productResearchReportSchema } from "../schemas/ProductResearchReport";
import { assembleStorefrontProductDraft } from "../pipeline/storefront-assembly";

export interface WriteResearchArtifactsOptions {
  artifactRoot?: string;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildSummary(report: ProductResearchReport) {
  const candidateLines = report.candidates.length
    ? report.candidates
        .map(
          (candidate) =>
            `| ${candidate.decision} | ${candidate.score.toFixed(2)} | ${candidate.sourceType} | ${candidate.normalizedDomain} | ${candidate.normalizedUrl} |`,
        )
        .join("\n")
    : "| none | 0.00 | n/a | n/a | n/a |";

  const warningLines = report.warnings.length
    ? report.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- none";

  const nextActionLines = report.nextActions.length
    ? report.nextActions.map((action) => `- ${action}`).join("\n")
    : "- none";

  const agentDecisionSection = report.agentDecision
    ? `## Agent Decision\n- Source: ${report.agentDecision.source}\n- Recorded At: ${report.agentDecision.recordedAt}\n- Deferred: ${report.agentDecision.defer ? "yes" : "no"}\n- Selected URL: ${report.agentDecision.selectedUrl ?? "(none)"}\n- Confidence: ${report.agentDecision.confidence ?? "(none)"}\n\n### Rationale\n${report.agentDecision.rationale}\n\n`
    : "";

  const storefrontDraft = assembleStorefrontProductDraft(report, {
    generatedAt: new Date(report.generatedAt),
  });

  return `# Product Research Report\n\n- Run ID: ${report.runId}\n- Status: ${report.status}\n- Selected Canonical URL: ${report.selectedCanonicalUrl ?? "(none)"}\n- Overall Confidence: ${report.confidence.overall.toFixed(2)}\n- Storefront Readiness: ${storefrontDraft.readiness.status}\n- Storefront Missing Fields: ${storefrontDraft.readiness.missingFields.length ? storefrontDraft.readiness.missingFields.join(", ") : "none"}\n\n${agentDecisionSection}## Warnings\n${warningLines}\n\n## Candidates\n| decision | score | source | domain | url |\n| --- | --- | --- | --- | --- |\n${candidateLines}\n\n## Next Actions\n${nextActionLines}\n`;
}

const defaultArtifactRoot = fileURLToPath(new URL("../../artifacts", import.meta.url));

export async function rewriteStoredResearchArtifacts(
  report: ProductResearchReport,
): Promise<ProductResearchReport> {
  const enrichedReport = productResearchReportSchema.parse(report);
  const artifacts = enrichedReport.artifacts;

  if (!artifacts) {
    throw new Error("Cannot rewrite research artifacts without artifact paths.");
  }

  await writeFile(artifacts.reportPath, `${JSON.stringify(enrichedReport, null, 2)}\n`, "utf8");
  await writeFile(artifacts.summaryPath, buildSummary(enrichedReport), "utf8");

  if (artifacts.storefrontProductPath) {
    const storefrontDraft = assembleStorefrontProductDraft(enrichedReport, {
      generatedAt: new Date(enrichedReport.generatedAt),
    });
    await writeFile(
      artifacts.storefrontProductPath,
      `${JSON.stringify(storefrontDraft, null, 2)}\n`,
      "utf8",
    );
  }

  return enrichedReport;
}

export async function writeResearchArtifacts(
  report: ProductResearchReport,
  rawInput: unknown,
  options: WriteResearchArtifactsOptions = {},
): Promise<ProductResearchReport> {
  const artifactRoot = options.artifactRoot ?? defaultArtifactRoot;
  const directoryName = `${report.generatedAt.replace(/[:.]/g, "-")}-${slugify(report.input.productId)}`;
  const artifactDir = path.resolve(artifactRoot, directoryName);

  await mkdir(artifactDir, { recursive: true });

  const inputPath = path.join(artifactDir, "input.json");
  const reportPath = path.join(artifactDir, "report.json");
  const summaryPath = path.join(artifactDir, "summary.md");
  const storefrontProductPath = path.join(artifactDir, "storefront-product.json");

  const enrichedReport = productResearchReportSchema.parse({
    ...report,
    artifacts: {
      artifactDir,
      inputPath,
      reportPath,
      summaryPath,
      storefrontProductPath,
    },
  });

  await writeFile(inputPath, `${JSON.stringify(rawInput, null, 2)}\n`, "utf8");
  await rewriteStoredResearchArtifacts(enrichedReport);

  return enrichedReport;
}
