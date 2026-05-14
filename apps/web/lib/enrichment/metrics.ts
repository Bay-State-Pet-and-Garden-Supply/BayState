/**
 * Metrics helpers for enrichment jobs.
 * Computes confidence summaries, cost estimates, retry rates.
 */

import type { EnrichmentResultV1 } from "./contracts";

export interface EnrichmentJobSummary {
  totalAttempts: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  averageConfidence: number;
  lowConfidenceCount: number;
  retryRate: number;
  warnings: string[];
}

/**
 * Compute a summary for a collection of enrichment results.
 */
export function summarizeEnrichmentResults(
  results: EnrichmentResultV1[]
): EnrichmentJobSummary {
  const totalAttempts = results.length;
  let successCount = 0;
  let partialCount = 0;
  let failedCount = 0;
  let totalConfidence = 0;
  let lowConfidenceCount = 0;
  let totalRetries = 0;

  for (const result of results) {
    switch (result.status) {
      case "success":
        successCount++;
        break;
      case "partial":
        partialCount++;
        break;
      case "failed":
        failedCount++;
        break;
    }

    totalConfidence += result.confidence.overall;

    if (result.confidence.overall < 0.7) {
      lowConfidenceCount++;
    }

    totalRetries += Math.max(0, result.attempts.length - 1);
  }

  const warnings: string[] = [];

  if (lowConfidenceCount > Math.ceil(totalAttempts * 0.3)) {
    warnings.push(
      `${lowConfidenceCount}/${totalAttempts} results have low confidence (< 0.7)`
    );
  }

  if (failedCount > Math.ceil(totalAttempts * 0.1)) {
    warnings.push(
      `${failedCount}/${totalAttempts} extractions failed entirely`
    );
  }

  return {
    totalAttempts,
    successCount,
    partialCount,
    failedCount,
    averageConfidence:
      totalAttempts > 0 ? totalConfidence / totalAttempts : 0,
    lowConfidenceCount,
    retryRate: totalAttempts > 0 ? totalRetries / totalAttempts : 0,
    warnings,
  };
}
