import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dedupeCandidates, rankCandidates } from "../../lib/candidate-scoring";
import { normalizeDomain, normalizeUrl } from "../../lib/url";
import { DefaultBriefBuilder } from "../../pipeline/brief/brief-builder";
import { SerperCandidateDiscovery } from "../../pipeline/discovery/serper-candidate-discovery";
import type { SerperStrategyEvalEntry } from "./dataset";
import { loadSerperStrategyEvalDataset } from "./dataset";

export interface SerperStrategyEvalRow {
  id: string;
  upc: string;
  brand: string;
  registerName: string;
  officialDomain: string;
  expectedQueries: string[];
  actualQueries: string[];
  stagedQueryPass: boolean;
  expectedPredictedName: string;
  actualPredictedName: string;
  predictedNamePass: boolean;
  expectedProductUrl: string;
  expectedProductUrlFound: boolean;
  topCandidateUrl?: string;
  topOfficialCandidateUrl?: string;
  topOfficialUrlPass: boolean;
  skuDiscoveryCandidateCount: number;
  officialDomainCandidateCount: number;
  warningMessages: string[];
  overallPass: boolean;
}

export interface SerperStrategyEvalSummary {
  totalEntries: number;
  stagedQueryPassRate: number;
  predictedNamePassRate: number;
  expectedProductUrlFoundRate: number;
  topOfficialUrlPassRate: number;
  warningsFreeRate: number;
  overallPassRate: number;
  averageSkuDiscoveryCandidateCount: number;
  averageOfficialDomainCandidateCount: number;
  failureBreakdown: Record<string, number>;
}

export interface SerperStrategyEvalReport {
  schemaVersion: "research-agent-serper-strategy-eval-report-v1";
  benchmarkType: "research_agent_serper_strategy";
  generatedAt: string;
  datasetPath: string;
  summary: SerperStrategyEvalSummary;
  entries: SerperStrategyEvalRow[];
}

export interface RunSerperStrategyEvalOptions {
  datasetPath: string;
  outputDir: string;
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanSearchText(value: string | undefined) {
  return (value ?? "")
    .replaceAll('"', " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQueryText(value: string | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteSearchTerm(value: string) {
  return `"${cleanSearchText(value)}"`;
}

function buildExpectedQueries(entry: SerperStrategyEvalEntry) {
  const domain = normalizeDomain(entry.officialDomain) ?? cleanSearchText(entry.officialDomain).toLowerCase();
  return [
    quoteSearchTerm(entry.upc),
    `site:${domain} ${cleanSearchText(entry.expectedPredictedName)}`,
  ];
}

function createFixtureFetch(entry: SerperStrategyEvalEntry) {
  const fixturesByQuery = new Map(entry.searchFixtures.map((fixture) => [normalizeQueryText(fixture.query), fixture.response]));

  return (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { q?: string };
    const query = normalizeQueryText(body.q);
    const fixture = fixturesByQuery.get(query);

    if (!fixture) {
      return new Response(
        JSON.stringify({ error: `Missing SERP fixture for query: ${query}` }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(fixture),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function buildFailureBreakdown(rows: SerperStrategyEvalRow[]) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    if (!row.stagedQueryPass) {
      counts.staged_query = (counts.staged_query ?? 0) + 1;
    }
    if (!row.predictedNamePass) {
      counts.predicted_name = (counts.predicted_name ?? 0) + 1;
    }
    if (!row.expectedProductUrlFound) {
      counts.expected_product_missing = (counts.expected_product_missing ?? 0) + 1;
    }
    if (!row.topOfficialUrlPass) {
      counts.top_official_url = (counts.top_official_url ?? 0) + 1;
    }
    if (row.warningMessages.length > 0) {
      counts.warnings = (counts.warnings ?? 0) + 1;
    }
  }

  return counts;
}

function summarizeRows(rows: SerperStrategyEvalRow[]): SerperStrategyEvalSummary {
  const totalEntries = rows.length;
  const rate = (predicate: (row: SerperStrategyEvalRow) => boolean) => (
    totalEntries ? rows.filter(predicate).length / totalEntries : 0
  );
  const average = (selector: (row: SerperStrategyEvalRow) => number) => (
    totalEntries ? rows.reduce((sum, row) => sum + selector(row), 0) / totalEntries : 0
  );

  return {
    totalEntries,
    stagedQueryPassRate: rate((row) => row.stagedQueryPass),
    predictedNamePassRate: rate((row) => row.predictedNamePass),
    expectedProductUrlFoundRate: rate((row) => row.expectedProductUrlFound),
    topOfficialUrlPassRate: rate((row) => row.topOfficialUrlPass),
    warningsFreeRate: rate((row) => row.warningMessages.length === 0),
    overallPassRate: rate((row) => row.overallPass),
    averageSkuDiscoveryCandidateCount: average((row) => row.skuDiscoveryCandidateCount),
    averageOfficialDomainCandidateCount: average((row) => row.officialDomainCandidateCount),
    failureBreakdown: buildFailureBreakdown(rows),
  };
}

function buildMarkdownReport(report: SerperStrategyEvalReport) {
  const summary = report.summary;
  const lines = [
    "# Research Agent SERP Strategy Eval",
    "",
    `- Generated At: ${report.generatedAt}`,
    `- Dataset: \`${report.datasetPath}\``,
    `- Total Entries: ${summary.totalEntries}`,
    `- Overall Pass Rate: ${(summary.overallPassRate * 100).toFixed(1)}%`,
    `- Predicted Name Pass Rate: ${(summary.predictedNamePassRate * 100).toFixed(1)}%`,
    `- Top Official URL Pass Rate: ${(summary.topOfficialUrlPassRate * 100).toFixed(1)}%`,
    `- Query Shape Pass Rate: ${(summary.stagedQueryPassRate * 100).toFixed(1)}%`,
    "",
    "## Entries",
    "",
  ];

  for (const entry of report.entries) {
    lines.push(`### ${entry.id}`);
    lines.push(`- Overall Pass: ${entry.overallPass ? "yes" : "no"}`);
    lines.push(`- Predicted Name: ${entry.actualPredictedName} (${entry.predictedNamePass ? "match" : `expected ${entry.expectedPredictedName}`})`);
    lines.push(`- Top Official URL: ${entry.topOfficialCandidateUrl ?? "(none)"} (${entry.topOfficialUrlPass ? "match" : `expected ${entry.expectedProductUrl}`})`);
    lines.push(`- Queries: ${entry.actualQueries.join(" -> ") || "(none)"}`);
    lines.push(`- SKU Candidates: ${entry.skuDiscoveryCandidateCount}`);
    lines.push(`- Official-Domain Candidates: ${entry.officialDomainCandidateCount}`);
    if (entry.warningMessages.length) {
      lines.push(`- Warnings: ${entry.warningMessages.join(" | ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writeReport(report: SerperStrategyEvalReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "serper-strategy-eval.json");
  const markdownPath = path.join(outputDir, "serper-strategy-eval.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdownReport(report), "utf8");

  return { jsonPath, markdownPath };
}

async function runSingleEntry(entry: SerperStrategyEvalEntry): Promise<SerperStrategyEvalRow> {
  const briefBuilder = new DefaultBriefBuilder();
  const brief = await briefBuilder.buildBrief({
    productId: entry.id,
    upc: entry.upc,
    registerName: entry.registerName,
    brand: entry.brand,
    officialDomain: entry.officialDomain,
    seedCandidateUrls: [],
  }, { now: new Date() });

  const provider = new SerperCandidateDiscovery({
    apiKey: "fixture-key",
    fetchImpl: createFixtureFetch(entry),
    resultLimit: 10,
  });

  const result = await provider.discoverCandidatesWithTrace(brief, { now: new Date() });
  const rankedCandidates = rankCandidates(brief.resolvedInput, dedupeCandidates(result.candidates));
  const expectedQueries = buildExpectedQueries(entry);
  const actualQueries = result.trace.queries;
  const expectedProductUrl = normalizeUrl(entry.expectedProductUrl);
  const topCandidateUrl = rankedCandidates[0]?.normalizedUrl;
  const topOfficialCandidate = rankedCandidates.find((candidate) => candidate.sourceType === "official");
  const topOfficialCandidateUrl = topOfficialCandidate?.normalizedUrl;
  const expectedProductUrlFound = rankedCandidates.some((candidate) => candidate.normalizedUrl === expectedProductUrl);
  const expectedOfficialDomainQuery = `site:${normalizeDomain(entry.officialDomain) ?? cleanSearchText(entry.officialDomain).toLowerCase()} ${cleanSearchText(result.trace.predictedName)}`;
  const expectedOfficialDomain = normalizeDomain(entry.officialDomain) ?? cleanSearchText(entry.officialDomain).toLowerCase();
  const stagedQueryPass = actualQueries.length >= 2
    && actualQueries[0] === quoteSearchTerm(entry.upc)
    && actualQueries[1] === expectedOfficialDomainQuery
    && actualQueries.slice(2).every((q) => q.startsWith(`site:${expectedOfficialDomain} "item-`));
  const predictedNamePass = normalizeText(result.trace.predictedName) === normalizeText(entry.expectedPredictedName);
  const topOfficialUrlPass = topOfficialCandidateUrl === expectedProductUrl;
  const warningMessages = result.warnings.map((warning) => warning.message);

  return {
    id: entry.id,
    upc: entry.upc,
    brand: entry.brand,
    registerName: entry.registerName,
    officialDomain: entry.officialDomain,
    expectedQueries,
    actualQueries,
    stagedQueryPass,
    expectedPredictedName: entry.expectedPredictedName,
    actualPredictedName: result.trace.predictedName,
    predictedNamePass,
    expectedProductUrl: expectedProductUrl,
    expectedProductUrlFound,
    topCandidateUrl,
    topOfficialCandidateUrl,
    topOfficialUrlPass,
    skuDiscoveryCandidateCount: result.trace.skuDiscoveryCandidateCount,
    officialDomainCandidateCount: result.trace.officialDomainCandidateCount,
    warningMessages,
    overallPass: stagedQueryPass && predictedNamePass && topOfficialUrlPass && warningMessages.length === 0,
  };
}

export async function runSerperStrategyEval(options: RunSerperStrategyEvalOptions) {
  const dataset = await loadSerperStrategyEvalDataset(options.datasetPath);
  const entries = await Promise.all(dataset.entries.map((entry) => runSingleEntry(entry)));

  const report: SerperStrategyEvalReport = {
    schemaVersion: "research-agent-serper-strategy-eval-report-v1",
    benchmarkType: "research_agent_serper_strategy",
    generatedAt: new Date().toISOString(),
    datasetPath: options.datasetPath,
    summary: summarizeRows(entries),
    entries,
  };

  const { jsonPath, markdownPath } = await writeReport(report, options.outputDir);
  return { report, jsonPath, markdownPath };
}
