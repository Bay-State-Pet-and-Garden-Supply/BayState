#!/usr/bin/env bun

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  KnownUrlCliScraperExtractionAdapter,
} from "./adapters/scraper-extraction";
import { runLiveSamples } from "./live/run-live-samples";
import { bootstrapLmStudioConfig } from "./pi/lmstudio";
import {
  inspectStandaloneAgentEnvironment,
  runAgentResearch,
  type ResearchAgentThinkingLevel,
} from "./pi/standalone";
import { runProductResearch } from "./research/runProductResearch";
import { writeResearchArtifacts } from "./storage/artifact-store";

function usage() {
  console.log(`Usage:
  bun run research-product --input <path> [--output-dir <path>] [--pipeline local|legacy-scraper] [--top-candidates <n>] [--save-page-artifacts] [--indexing off|lookup-only|refresh-stale|cold-start] [--force-index-refresh] [--page-acquisition http|agent-browser|auto|none]
  bun run agent-research-product --input <path> [--output-dir <path>] [--pipeline local|legacy-scraper] [--model <provider/model>] [--thinking <level>] [--agent-home <path>]
  bun run agent-env [--agent-home <path>]
  bun run agent-bootstrap-lmstudio [--model-id <id>] [--base-url <url>] [--api-key <key>] [--agent-home <path>]
  bun run live-sample-research [--limit <n>] [--limit-per-brand <n>] [--sampling-mode candidate-baseline|production-shaped] [--upc <upc>] [--brand <brand>] [--output-dir <path>] [--agent] [--verbose-agent] [--pipeline local|legacy-scraper] [--page-acquisition http|agent-browser|auto|none] [--indexing off|lookup-only|refresh-stale|cold-start] [--model <provider/model>] [--thinking <level>] [--agent-home <path>]
  bun run serper-eval [--dataset <path>] [--output-dir <path>]
  bun run extraction-eval [--dataset <path>] [--output-dir <path>]
  bun run src/cli.ts index-domain --brand <brand> --domain <domain> [--max-pages <n>] [--force]
  bun run src/cli.ts cache-stats
  bun run src/cli.ts cache-prune [--older-than-days <days>]

Commands:
  research-product        Discover, score, and extract product evidence into a ProductResearchReport artifact
  agent-research-product  Run the standalone Pi harness around the deterministic research workflow
  agent-env                 Print the standalone Pi harness environment and available models
  agent-bootstrap-lmstudio  Detect a local LM Studio server and write standalone Pi auth/models config
  live-sample-research      Run read-only Supabase-backed live sample research batches locally
  serper-eval               Run the fixture-backed SERP strategy benchmark for SKU-first discovery
  extraction-eval           Run the fixture-backed extraction quality benchmark
  index-domain            Pre-index and cache all product-like pages from an official brand domain sitemap
  cache-stats             Show page cache database statistics
  cache-prune             Prune old cache records

Flags:
  --indexing         Set cache indexing mode: off | lookup-only | refresh-stale | cold-start (default: cold-start)
  --force-index-refresh Force indexer to run even if sitemaps or pages are cached
  --pipeline         Select research pipeline: local (native deterministic) or legacy-scraper
  --page-acquisition Set verification acquisition mode: http | agent-browser | auto | none (default: auto)
  --top-candidates   Number of candidate pages to acquire/extract (default: 3)
  --save-page-artifacts Save HTML, text, and screenshot assets under artifacts directory
  --use-scraper      Legacy: call the scraper-side known-url wrapper for extraction (maps to --pipeline legacy-scraper)
  --model            Override the Pi model as <provider>/<model-id>
  --thinking         Set Pi thinking level (off|minimal|low|medium|high|xhigh)
  --agent-home       Override the standalone Pi runtime directory
  --model-id         Select the LM Studio model ID when bootstrapping
  --base-url         Override LM Studio base URL (default http://127.0.0.1:1234/v1)
  --api-key          Override the stored LM Studio API key value (default lm-studio)
  --limit            Limit live sample products loaded from Supabase
  --limit-per-brand  Cap production-shaped live sampling per brand (default: 2)
  --sampling-mode    candidate-baseline or production-shaped (default: candidate-baseline)
  --upc              Restrict live sample runs to one UPC
  --brand            Filter live sample rows by brand name
  --agent            Use the Pi harness for each live sample instead of deterministic-only runs
  --verbose-agent    Stream per-sample Pi assistant text/tool events during live sample batches
`);
}

function getFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function resolveInputPath(inputPathValue: string) {
  const appRoot = inspectStandaloneAgentEnvironment().appRoot;
  const candidates = [
    path.resolve(process.cwd(), inputPathValue),
    path.resolve(appRoot, inputPathValue),
    process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD, inputPathValue) : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), inputPathValue);
}

async function runResearchProduct(args: string[]) {
  const inputPathValue = getFlagValue(args, "--input");
  const outputDirValue = getFlagValue(args, "--output-dir");
  const useScraper = args.includes("--use-scraper");
  const pipelineValue = getFlagValue(args, "--pipeline") ?? (useScraper ? "legacy-scraper" : "local");
  const topCandidatesValue = getFlagValue(args, "--top-candidates");
  const savePageArtifacts = args.includes("--save-page-artifacts");
  const indexingValue = getFlagValue(args, "--indexing") as any;
  const forceIndexRefresh = args.includes("--force-index-refresh");
  const pageAcquisitionValue = getFlagValue(args, "--page-acquisition") as any;

  if (!inputPathValue) {
    throw new Error("Missing required --input <path> argument.");
  }

  const inputPath = await resolveInputPath(inputPathValue);
  const rawInput = JSON.parse(await readFile(inputPath, "utf8"));
  const artifactRoot = outputDirValue ? path.resolve(process.cwd(), outputDirValue) : undefined;

  let report;

  if (pipelineValue === "legacy-scraper") {
    const legacyReport = await runProductResearch(rawInput, {
      extractionAdapter: new KnownUrlCliScraperExtractionAdapter(),
    });
    report = legacyReport;
  } else {
    const topN = topCandidatesValue ? Number(topCandidatesValue) : 3;
    const { runProductResearchV2 } = await import("./research/runProductResearchV2");
    const result = await runProductResearchV2(rawInput, {
      topN,
      artifactRoot,
      savePageArtifacts,
      pageAcquisition: pageAcquisitionValue ?? "auto",
      indexing: indexingValue,
      forceIndexRefresh,
    });
    report = result.report;
  }

  const storedReport = await writeResearchArtifacts(report, rawInput, {
    artifactRoot,
  });

  console.log(
    JSON.stringify(
      {
        status: storedReport.status,
        selectedCanonicalUrl: storedReport.selectedCanonicalUrl ?? null,
        usedScraper: pipelineValue === "legacy-scraper",
        reportPath: storedReport.artifacts?.reportPath ?? null,
        summaryPath: storedReport.artifacts?.summaryPath ?? null,
        storefrontProductPath: storedReport.artifacts?.storefrontProductPath ?? null,
      },
      null,
      2,
    ),
  );
}

async function runAgentResearchProduct(args: string[]) {
  const inputPathValue = getFlagValue(args, "--input");
  const outputDirValue = getFlagValue(args, "--output-dir");
  const model = getFlagValue(args, "--model");
  const thinking = getFlagValue(args, "--thinking") as ResearchAgentThinkingLevel | undefined;
  const agentHome = getFlagValue(args, "--agent-home");
  const useScraper = args.includes("--use-scraper");
  const pipelineValue = getFlagValue(args, "--pipeline") ?? (useScraper ? "legacy-scraper" : "local");

  if (!inputPathValue) {
    throw new Error("Missing required --input <path> argument.");
  }

  const inputPath = await resolveInputPath(inputPathValue);
  const rawInput = JSON.parse(await readFile(inputPath, "utf8"));
  const result = await runAgentResearch(rawInput, {
    useScraper: pipelineValue === "legacy-scraper",
    outputDir: outputDirValue,
    model,
    thinkingLevel: thinking,
    agentHome,
    invocationCwd: process.cwd(),
    printEvents: true,
  });

  console.log();
  console.log(
    JSON.stringify(
      {
        status: result.report.status,
        selectedCanonicalUrl: result.report.selectedCanonicalUrl ?? null,
        agentSelectedUrl: result.agentDecision?.selectedUrl ?? null,
        agentDeferred: result.agentDecision?.defer ?? null,
        agentDecisionConfidence: result.agentDecision?.confidence ?? null,
        reportPath: result.report.artifacts?.reportPath ?? null,
        summaryPath: result.report.artifacts?.summaryPath ?? null,
        storefrontProductPath: result.report.artifacts?.storefrontProductPath ?? null,
        agentSummaryPath: result.agentSummaryPath,
        agentDetailsPath: result.agentDetailsPath,
        model: result.model,
      },
      null,
      2,
    ),
  );
}

async function runAgentEnv(args: string[]) {
  const agentHome = getFlagValue(args, "--agent-home");
  const environment = inspectStandaloneAgentEnvironment({ agentHome });
  console.log(JSON.stringify(environment, null, 2));
}

async function runAgentBootstrapLmStudio(args: string[]) {
  const agentHome = getFlagValue(args, "--agent-home");
  const requestedModelId = getFlagValue(args, "--model-id");
  const baseUrl = getFlagValue(args, "--base-url");
  const apiKey = getFlagValue(args, "--api-key");
  const result = await bootstrapLmStudioConfig({
    agentHome,
    requestedModelId,
    baseUrl,
    apiKey,
  });

  console.log(JSON.stringify(result, null, 2));
}

async function runLiveSampleResearch(args: string[]) {
  const outputDirValue = getFlagValue(args, "--output-dir");
  const model = getFlagValue(args, "--model");
  const thinking = getFlagValue(args, "--thinking") as ResearchAgentThinkingLevel | undefined;
  const agentHome = getFlagValue(args, "--agent-home");
  const limit = getFlagValue(args, "--limit");
  const limitPerBrand = getFlagValue(args, "--limit-per-brand");
  const samplingMode = getFlagValue(args, "--sampling-mode") as "candidate-baseline" | "production-shaped" | undefined;
  const upc = getFlagValue(args, "--upc");
  const brand = getFlagValue(args, "--brand");
  const useScraper = args.includes("--use-scraper");
  const pipelineValue = getFlagValue(args, "--pipeline") as "local" | "legacy-scraper" | undefined;
  const pageAcquisition = getFlagValue(args, "--page-acquisition") as "http" | "agent-browser" | "auto" | "none" | undefined;
  const indexing = getFlagValue(args, "--indexing") as "off" | "lookup-only" | "refresh-stale" | "cold-start" | undefined;
  
  const result = await runLiveSamples({
    outputDir: outputDirValue,
    model,
    thinkingLevel: thinking,
    agentHome,
    useScraper,
    pipeline: pipelineValue,
    agent: args.includes("--agent"),
    verboseAgent: args.includes("--verbose-agent"),
    upc,
    brand,
    pageAcquisition,
    indexing,
    samplingMode,
    ...(limit ? { limit: Number(limit) } : {}),
    ...(limitPerBrand ? { limitPerBrand: Number(limitPerBrand) } : {}),
  });

  console.log(JSON.stringify({
    outputDir: result.outputDir,
    sampleInputsPath: result.sampleInputsPath,
    warningsPath: result.warningsPath,
    resultsPath: result.resultsPath,
    summaryJsonPath: result.summaryJsonPath,
    summaryMarkdownPath: result.summaryMarkdownPath,
    attempted: result.results.length,
    failed: result.results.filter((item) => Boolean(item.error)).length,
  }, null, 2));
}

async function runSerperEval(args: string[]) {
  const environment = inspectStandaloneAgentEnvironment();
  const datasetPathValue = getFlagValue(args, "--dataset") ?? "benchmarks/serper-strategy/fixtures/smoke-dataset.json";
  const outputDirValue = getFlagValue(args, "--output-dir") ?? path.join("artifacts", "evals", "serper-strategy", "latest");
  const datasetPath = await resolveInputPath(datasetPathValue);
  const outputDir = path.resolve(environment.appRoot, outputDirValue);

  const { runSerperStrategyEval } = await import("./evals/serper-strategy/runner");
  const { report, jsonPath, markdownPath } = await runSerperStrategyEval({
    datasetPath,
    outputDir,
  });

  console.log(JSON.stringify({
    datasetPath,
    outputDir,
    jsonPath,
    markdownPath,
    summary: report.summary,
  }, null, 2));
}

async function runExtractionEval(args: string[]) {
  const environment = inspectStandaloneAgentEnvironment();
  const datasetPathValue = getFlagValue(args, "--dataset") ?? "benchmarks/extraction-quality/fixtures/smoke-dataset.json";
  const outputDirValue = getFlagValue(args, "--output-dir") ?? path.join("artifacts", "evals", "extraction-quality", "latest");
  const datasetPath = await resolveInputPath(datasetPathValue);
  const outputDir = path.resolve(environment.appRoot, outputDirValue);

  const { runExtractionQualityEval } = await import("./evals/extraction-quality/runner");
  const { report, jsonPath, markdownPath } = await runExtractionQualityEval({
    datasetPath,
    outputDir,
  });

  console.log(JSON.stringify({
    datasetPath,
    outputDir,
    jsonPath,
    markdownPath,
    summary: report.summary,
  }, null, 2));
}

async function runIndexDomain(args: string[]) {
  const brand = getFlagValue(args, "--brand");
  const domain = getFlagValue(args, "--domain");
  const maxPagesValue = getFlagValue(args, "--max-pages");
  const force = args.includes("--force");

  if (!brand || !domain) {
    throw new Error("Missing required --brand <name> and --domain <domain> arguments.");
  }

  const { PageIndexDb } = await import("./cache/page-index-db");
  const { PageIndexRepository } = await import("./cache/page-index-repository");
  const { OfficialDomainIndexer } = await import("./pipeline/discovery/official-domain-indexer");
  const { HttpPageAcquisition } = await import("./pipeline/acquisition/http-page-acquisition");
  const { JsonLdExtractor } = await import("./pipeline/extraction/jsonld-extractor");
  const { MetaExtractor } = await import("./pipeline/extraction/meta-extractor");
  const { TextHeuristicExtractor } = await import("./pipeline/extraction/text-heuristic-extractor");
  const { ProductDomExtractor } = await import("./pipeline/extraction/product-dom-extractor");
  const { DefaultBriefBuilder } = await import("./pipeline/brief/brief-builder");

  const db = new PageIndexDb();
  const repository = new PageIndexRepository(db);
  const indexer = new OfficialDomainIndexer();

  const briefBuilder = new DefaultBriefBuilder();
  const brief = await briefBuilder.buildBrief(
    {
      productId: `index-${domain}`,
      upc: "000000000000",
      registerName: `Index Run for ${domain}`,
      brand,
      officialWebsiteUrl: `https://${domain}`,
      seedCandidateUrls: [],
    },
    { now: new Date() }
  );

  console.log(`Starting index crawl for domain: ${domain} (brand: ${brand})...`);

  const result = await indexer.indexDomainForBrief(
    brief,
    { now: new Date() },
    {
      pageAcquisition: new HttpPageAcquisition({ timeoutMs: 8_000 }),
      factExtractors: [
        new JsonLdExtractor(),
        new MetaExtractor(),
        new TextHeuristicExtractor(),
        new ProductDomExtractor(),
      ],
      repository,
      maxPagesFetched: maxPagesValue ? Number(maxPagesValue) : 50,
      maxElapsedMs: 120_000,
      perPageTimeoutMs: 8_000,
      forceRefresh: force,
    }
  );

  console.log("Index Domain Result:", JSON.stringify(result, null, 2));
  db.close();
}

async function runCacheStats() {
  const { PageIndexDb } = await import("./cache/page-index-db");
  const { PageIndexRepository } = await import("./cache/page-index-repository");

  const db = new PageIndexDb();
  const repository = new PageIndexRepository(db);

  const stats = await repository.getStats();
  console.log("Cache Database Stats:");
  console.log(JSON.stringify(stats, null, 2));
  db.close();
}

async function runCachePrune(args: string[]) {
  const olderThanValue = getFlagValue(args, "--older-than-days") ?? "30";
  const days = Number(olderThanValue);

  const { PageIndexDb } = await import("./cache/page-index-db");
  const { PageIndexRepository } = await import("./cache/page-index-repository");

  const db = new PageIndexDb();
  const repository = new PageIndexRepository(db);

  console.log(`Pruning cache records older than ${days} days...`);
  await repository.pruneOldRecords(days);
  console.log("Prune completed successfully.");
  db.close();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "research-product") {
    await runResearchProduct(args);
    return;
  }

  if (command === "agent-research-product") {
    await runAgentResearchProduct(args);
    return;
  }

  if (command === "agent-env") {
    await runAgentEnv(args);
    return;
  }

  if (command === "agent-bootstrap-lmstudio") {
    await runAgentBootstrapLmStudio(args);
    return;
  }

  if (command === "live-sample-research") {
    await runLiveSampleResearch(args);
    return;
  }

  if (command === "serper-eval") {
    await runSerperEval(args);
    return;
  }

  if (command === "extraction-eval") {
    await runExtractionEval(args);
    return;
  }

  if (command === "index-domain") {
    await runIndexDomain(args);
    return;
  }

  if (command === "cache-stats") {
    await runCacheStats();
    return;
  }

  if (command === "cache-prune") {
    await runCachePrune(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
