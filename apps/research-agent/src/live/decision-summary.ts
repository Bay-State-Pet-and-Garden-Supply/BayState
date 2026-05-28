import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface LiveSampleRunResult {
  upc: string;
  productId: string;
  brand: string;
  reportStatus?: string;
  selectedCanonicalUrl?: string;
  agentSelectedUrl?: string;
  agentDeferred?: boolean;
  agentDecisionConfidence?: number;
  warningCount: number;
  warningMessages: string[];
  error?: string;
}

export interface DecisionSummary {
  totals: {
    attempted: number;
    completed: number;
    failed: number;
  };
  deterministicStatuses: Record<string, number>;
  agentDecisions: {
    selected: number;
    deferred: number;
    missing: number;
  };
  agreement: {
    matchedDeterministic: number;
    overrodeDeterministic: number;
    selectedAfterNoDeterministic: number;
  };
  topWarnings: Array<{ warning: string; count: number }>;
  examples: {
    deferred: string[];
    overrides: string[];
    failures: string[];
  };
}

function buildDecisionSummary(results: LiveSampleRunResult[]): DecisionSummary {
  const deterministicStatuses: Record<string, number> = {};
  const warningCounts = new Map<string, number>();
  const summary: DecisionSummary = {
    totals: {
      attempted: results.length,
      completed: results.filter((result) => !result.error).length,
      failed: results.filter((result) => Boolean(result.error)).length,
    },
    deterministicStatuses,
    agentDecisions: {
      selected: 0,
      deferred: 0,
      missing: 0,
    },
    agreement: {
      matchedDeterministic: 0,
      overrodeDeterministic: 0,
      selectedAfterNoDeterministic: 0,
    },
    topWarnings: [],
    examples: {
      deferred: [],
      overrides: [],
      failures: [],
    },
  };

  for (const result of results) {
    if (result.reportStatus) {
      deterministicStatuses[result.reportStatus] = (deterministicStatuses[result.reportStatus] ?? 0) + 1;
    }

    if (result.error) {
      summary.examples.failures.push(`${result.upc}: ${result.error}`);
      continue;
    }

    if (result.agentDeferred) {
      summary.agentDecisions.deferred += 1;
      summary.examples.deferred.push(result.upc);
    } else if (result.agentSelectedUrl) {
      summary.agentDecisions.selected += 1;
      if (result.selectedCanonicalUrl && result.selectedCanonicalUrl === result.agentSelectedUrl) {
        summary.agreement.matchedDeterministic += 1;
      } else if (result.selectedCanonicalUrl && result.selectedCanonicalUrl !== result.agentSelectedUrl) {
        summary.agreement.overrodeDeterministic += 1;
        summary.examples.overrides.push(result.upc);
      } else if (!result.selectedCanonicalUrl) {
        summary.agreement.selectedAfterNoDeterministic += 1;
      }
    } else {
      summary.agentDecisions.missing += 1;
    }

    for (const warning of result.warningMessages) {
      warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
    }
  }

  summary.topWarnings = [...warningCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([warning, count]) => ({ warning, count }));

  summary.examples.deferred = summary.examples.deferred.slice(0, 10);
  summary.examples.overrides = summary.examples.overrides.slice(0, 10);
  summary.examples.failures = summary.examples.failures.slice(0, 10);

  return summary;
}

export async function writeDecisionSummaryArtifacts(
  outputDir: string,
  results: LiveSampleRunResult[],
) {
  const summary = buildDecisionSummary(results);
  const summaryJsonPath = path.join(outputDir, "live-sample-summary.json");
  const summaryMarkdownPath = path.join(outputDir, "live-sample-summary.md");

  const markdown = [
    "# Live Sample Decision Summary",
    "",
    `- Attempted: ${summary.totals.attempted}`,
    `- Completed: ${summary.totals.completed}`,
    `- Failed: ${summary.totals.failed}`,
    `- Agent selected: ${summary.agentDecisions.selected}`,
    `- Agent deferred: ${summary.agentDecisions.deferred}`,
    `- Agent missing decision: ${summary.agentDecisions.missing}`,
    `- Agent matched deterministic selection: ${summary.agreement.matchedDeterministic}`,
    `- Agent overrode deterministic selection: ${summary.agreement.overrodeDeterministic}`,
    `- Agent selected after no deterministic winner: ${summary.agreement.selectedAfterNoDeterministic}`,
    "",
    "## Deterministic Status Counts",
    ...Object.entries(summary.deterministicStatuses).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Top Warnings",
    ...(summary.topWarnings.length
      ? summary.topWarnings.map((entry) => `- ${entry.count}× ${entry.warning}`)
      : ["- none"]),
    "",
    "## Example Overrides",
    ...(summary.examples.overrides.length ? summary.examples.overrides.map((value) => `- ${value}`) : ["- none"]),
    "",
    "## Example Deferrals",
    ...(summary.examples.deferred.length ? summary.examples.deferred.map((value) => `- ${value}`) : ["- none"]),
    "",
    "## Example Failures",
    ...(summary.examples.failures.length ? summary.examples.failures.map((value) => `- ${value}`) : ["- none"]),
  ].join("\n");

  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdownPath, `${markdown}\n`, "utf8");

  return { summary, summaryJsonPath, summaryMarkdownPath };
}
