import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { EvaluatedCandidate } from "../schemas/CandidateUrl";
import type { ResolvedProductResearchInput } from "../schemas/ProductResearchInput";
import { normalizeUrl } from "../lib/url";
import type { ExtractedResearchFields } from "../schemas/ProductResearchReport";

export type ScraperExtractionResult =
  | {
      status: "success";
      extracted: ExtractedResearchFields;
      warnings?: string[];
    }
  | {
      status: "unavailable" | "failed";
      reason: string;
      warnings?: string[];
    };

export interface ScraperExtractionAdapter {
  extract(
    input: ResolvedProductResearchInput,
    candidate: EvaluatedCandidate,
  ): Promise<ScraperExtractionResult>;
}

export const unavailableScraperExtractionAdapter: ScraperExtractionAdapter = {
  async extract() {
    return {
      status: "unavailable",
      reason:
        "No scraper-side known-URL extraction wrapper is configured for the research-agent MVP.",
    };
  },
};

const wrapperPayloadSchema = z.object({
  description: z.string().min(1).optional(),
  images: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const wrapperResponseSchema = z.object({
  status: z.enum(["success", "failed", "unavailable"]),
  extracted: wrapperPayloadSchema.optional(),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  raw_result: z.record(z.string(), z.unknown()).optional(),
});

type WrapperResponse = z.infer<typeof wrapperResponseSchema>;

const defaultScraperCwd = fileURLToPath(new URL("../../../scraper", import.meta.url));

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type KnownUrlWrapperRunner = (payload: string) => Promise<CommandResult>;

export interface KnownUrlCliScraperExtractionAdapterOptions {
  runner?: KnownUrlWrapperRunner;
}

function toConfidence(rawResult: WrapperResponse["raw_result"] | undefined) {
  const value = rawResult?.confidence;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.7;
}

function toEvidence<T>(
  value: T,
  sourceUrl: string,
  evidence: string,
  confidence: number,
) {
  return {
    value,
    confidence,
    sourceType: "scraper" as const,
    sourceUrl,
    evidence,
  };
}

function mapWrapperSuccess(
  candidate: EvaluatedCandidate,
  response: WrapperResponse,
): ExtractedResearchFields {
  const extracted = response.extracted ?? {};
  const rawResult = response.raw_result;
  const method = typeof rawResult?.method === "string" ? rawResult.method : "product-page-extractor";
  const confidence = toConfidence(rawResult);
  const evidence = `Extracted via scraper known-url wrapper using ${method}.`;

  return {
    ...(extracted.description
      ? {
          description: toEvidence(
            extracted.description,
            candidate.normalizedUrl,
            evidence,
            confidence,
          ),
        }
      : {}),
    ...(extracted.images && extracted.images.length > 0
      ? {
          images: toEvidence(
            extracted.images,
            candidate.normalizedUrl,
            evidence,
            confidence,
          ),
        }
      : {}),
    ...(extracted.categories && extracted.categories.length > 0
      ? {
          categories: toEvidence(
            extracted.categories,
            candidate.normalizedUrl,
            evidence,
            confidence,
          ),
        }
      : {}),
    ...(extracted.attributes && Object.keys(extracted.attributes).length > 0
      ? {
          attributes: toEvidence(
            extracted.attributes,
            candidate.normalizedUrl,
            evidence,
            confidence,
          ),
        }
      : {}),
  };
}

async function runDefaultKnownUrlWrapper(payload: string): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(
      "uv",
      [
        "run",
        "--with-requirements",
        "requirements.txt",
        "python",
        "scripts/known_url_extract.py",
        "--stdin",
      ],
      {
        cwd: defaultScraperCwd,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function buildFallbackUrls(input: ResolvedProductResearchInput, candidate: EvaluatedCandidate) {
  return input.candidateUrls
    .map((item) => {
      try {
        return normalizeUrl(item.url);
      } catch {
        return undefined;
      }
    })
    .filter((url): url is string => Boolean(url) && url !== candidate.normalizedUrl)
    .slice(0, 3);
}

function parseJsonResponseCandidate(candidate: string): WrapperResponse | undefined {
  try {
    return wrapperResponseSchema.parse(JSON.parse(candidate));
  } catch {
    return undefined;
  }
}

function parseWrapperResponse(output: CommandResult): WrapperResponse | undefined {
  const stdout = output.stdout.trim();
  if (!stdout) return undefined;

  const parsedFullOutput = parseJsonResponseCandidate(stdout);
  if (parsedFullOutput) return parsedFullOutput;

  for (const line of stdout.split(/\r?\n/).reverse()) {
    const candidate = line.trim();
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
      continue;
    }

    const parsedLine = parseJsonResponseCandidate(candidate);
    if (parsedLine) return parsedLine;
  }

  return undefined;
}

function compactFailureText(value: string, maxLength = 1_200) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}… [truncated ${trimmed.length - maxLength} chars]`;
}

function buildFailureReason(output: CommandResult, response?: WrapperResponse) {
  if (response?.error) return compactFailureText(response.error);
  if (response?.reason) return compactFailureText(response.reason);
  if (output.stderr.trim()) return compactFailureText(output.stderr);
  if (output.stdout.trim()) return compactFailureText(output.stdout);
  return "Scraper known-url wrapper failed without returning a usable response.";
}

export class KnownUrlCliScraperExtractionAdapter
  implements ScraperExtractionAdapter
{
  private readonly runner: KnownUrlWrapperRunner;

  constructor(options: KnownUrlCliScraperExtractionAdapterOptions = {}) {
    this.runner = options.runner ?? runDefaultKnownUrlWrapper;
  }

  async extract(
    input: ResolvedProductResearchInput,
    candidate: EvaluatedCandidate,
  ): Promise<ScraperExtractionResult> {
    const fallbackUrls = buildFallbackUrls(input, candidate);
    const payload = JSON.stringify({
      url: candidate.normalizedUrl,
      upc: input.upc ?? input.productId,
      product_name: input.registerName,
      register_name: input.registerName,
      brand: input.brand,
      ...(fallbackUrls.length ? { fallback_urls: fallbackUrls } : {}),
    });

    let commandResult: CommandResult;
    try {
      commandResult = await this.runner(payload);
    } catch (error) {
      return {
        status: "failed",
        reason:
          error instanceof Error
            ? `Failed to launch scraper known-url wrapper: ${error.message}`
            : "Failed to launch scraper known-url wrapper.",
      };
    }

    const response = parseWrapperResponse(commandResult);

    if (!response) {
      return {
        status: "failed",
        reason: buildFailureReason(commandResult),
      };
    }

    if (commandResult.exitCode !== 0 || response.status !== "success") {
      return {
        status: response.status === "unavailable" ? "unavailable" : "failed",
        reason: buildFailureReason(commandResult, response),
        warnings: response.warnings,
      };
    }

    return {
      status: "success",
      extracted: mapWrapperSuccess(candidate, response),
      warnings: response.warnings,
    };
  }
}
