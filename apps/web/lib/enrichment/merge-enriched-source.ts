import { normalizeDistributorSlug } from "@/lib/approved-sources/distributor-catalog";
import type {
  ApprovedSourceSnapshotV1,
  EnrichmentAttemptSummaryV1,
  EnrichmentResultStatus,
  EnrichmentValidationV1,
  NormalizedEnrichedSourceV1,
  RequestedExtractionMode,
  SourceResultInfo,
} from "./contracts";

interface MergeEnrichedSourceOptions {
  incomingStatus: EnrichmentResultStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizeSourceSlug(sourceSlug: unknown, sourceType: unknown): string | null {
  const normalizedSlug = toOptionalString(sourceSlug);
  const normalizedSourceType = toOptionalString(sourceType);

  if (!normalizedSlug) {
    return null;
  }

  if (normalizedSourceType === "distributor") {
    return normalizeDistributorSlug(normalizedSlug);
  }

  return normalizedSlug;
}

function isMeaningfulSnapshot(snapshot: ApprovedSourceSnapshotV1 | null | undefined): boolean {
  if (!snapshot) {
    return false;
  }

  const name = toOptionalString(snapshot.name) ?? toOptionalString(snapshot.title);
  if (name) {
    return true;
  }

  const images = Array.isArray(snapshot.images) ? snapshot.images : snapshot.image_urls;
  if (Array.isArray(images) && images.length > 0) {
    return true;
  }

  const extracted = isRecord(snapshot.extracted) ? snapshot.extracted : null;
  if (extracted) {
    return Object.values(extracted).some((value) => {
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== null && value !== undefined;
    });
  }

  return false;
}

function mergeValidation(
  existing: EnrichmentValidationV1 | undefined,
  incoming: EnrichmentValidationV1 | undefined,
): EnrichmentValidationV1 {
  const current = existing ?? {};
  const next = incoming ?? {};

  return {
    upc_match: next.upc_match ?? current.upc_match ?? null,
    warnings: Array.from(new Set([...(current.warnings ?? []), ...(next.warnings ?? [])])),
    missing_required: Array.from(new Set([...(current.missing_required ?? []), ...(next.missing_required ?? [])])),
  };
}

function mergeAttempts(
  existing: EnrichmentAttemptSummaryV1[] | undefined,
  incoming: EnrichmentAttemptSummaryV1[] | undefined,
): EnrichmentAttemptSummaryV1[] {
  const merged: EnrichmentAttemptSummaryV1[] = [];
  const seen = new Set<string>();

  for (const attempt of [...(existing ?? []), ...(incoming ?? [])]) {
    const key = JSON.stringify(attempt);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(attempt);
  }

  return merged;
}

function rankSourceResult(result: SourceResultInfo): number {
  const matchedFieldsCount = Array.isArray(result.matchedFields) ? result.matchedFields.length : 0;
  return (result.confidence * 1000) + matchedFieldsCount;
}

function mergeSourceResults(
  ...collections: Array<SourceResultInfo[] | undefined>
): SourceResultInfo[] {
  const merged = new Map<string, SourceResultInfo>();

  for (const collection of collections) {
    for (const rawEntry of collection ?? []) {
      const normalizedSlug = canonicalizeSourceSlug(rawEntry.sourceSlug, rawEntry.sourceType);
      if (!normalizedSlug) {
        continue;
      }

      const normalizedEntry: SourceResultInfo = {
        ...rawEntry,
        sourceSlug: normalizedSlug,
      };

      const existing = merged.get(normalizedSlug);
      if (!existing || rankSourceResult(normalizedEntry) >= rankSourceResult(existing)) {
        merged.set(normalizedSlug, normalizedEntry);
      }
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return left.sourceSlug.localeCompare(right.sourceSlug);
  });
}

function coerceSnapshot(raw: unknown): ApprovedSourceSnapshotV1 | null {
  if (!isRecord(raw)) {
    return null;
  }

  const rest = { ...raw };
  delete rest.approved_sources;
  return rest as unknown as ApprovedSourceSnapshotV1;
}

function getExistingApprovedSources(existing: NormalizedEnrichedSourceV1 | null): Record<string, ApprovedSourceSnapshotV1> {
  if (!existing || !isRecord(existing.approved_sources)) {
    return {};
  }

  const approvedSources: Record<string, ApprovedSourceSnapshotV1> = {};
  for (const [sourceSlug, snapshot] of Object.entries(existing.approved_sources)) {
    const coercedSnapshot = coerceSnapshot(snapshot);
    if (coercedSnapshot) {
      approvedSources[sourceSlug] = coercedSnapshot;
    }
  }

  return approvedSources;
}

function bootstrapLegacyApprovedSources(existing: NormalizedEnrichedSourceV1 | null): Record<string, ApprovedSourceSnapshotV1> {
  if (!existing || isRecord(existing.approved_sources)) {
    return {};
  }

  const sourceSlug =
    canonicalizeSourceSlug(existing.active_source_slug, existing.source_type)
    ?? canonicalizeSourceSlug(existing.source_slug, existing.source_type)
    ?? (() => {
      const firstSourceResult = existing.source_results?.find((entry) => canonicalizeSourceSlug(entry.sourceSlug, entry.sourceType));
      return firstSourceResult
        ? canonicalizeSourceSlug(firstSourceResult.sourceSlug, firstSourceResult.sourceType)
        : null;
    })();

  const existingSnapshot = coerceSnapshot(existing);
  if (!sourceSlug || !existingSnapshot || !isMeaningfulSnapshot(existingSnapshot)) {
    return {};
  }

  return {
    [sourceSlug]: existingSnapshot,
  };
}

function coerceNormalizedEnrichedSource(raw: unknown): NormalizedEnrichedSourceV1 | null {
  if (!isRecord(raw)) {
    return null;
  }

  return raw as unknown as NormalizedEnrichedSourceV1;
}

function mergeSnapshot(
  existing: ApprovedSourceSnapshotV1 | undefined,
  incoming: ApprovedSourceSnapshotV1,
  options: MergeEnrichedSourceOptions,
): ApprovedSourceSnapshotV1 {
  if (!existing) {
    return incoming;
  }

  const incomingIsAccepted =
    options.incomingStatus === "success"
    || (options.incomingStatus === "partial" && incoming.confidence.overall >= 0.6);
  const incomingHasMeaningfulData = isMeaningfulSnapshot(incoming);

  if (incomingIsAccepted && incomingHasMeaningfulData) {
    return {
      ...existing,
      ...incoming,
      llm_used: Boolean(existing.llm_used) || Boolean(incoming.llm_used),
      requested_extraction_mode:
        incoming.requested_extraction_mode
        ?? existing.requested_extraction_mode
        ?? null,
      validation: mergeValidation(existing.validation, incoming.validation),
      attempts: mergeAttempts(existing.attempts, incoming.attempts),
      source_results: mergeSourceResults(existing.source_results, incoming.source_results),
      source_slug: incoming.source_slug ?? existing.source_slug ?? null,
      source_type: incoming.source_type ?? existing.source_type ?? null,
      source_label: incoming.source_label ?? existing.source_label ?? null,
      active_source_slug:
        incoming.active_source_slug
        ?? incoming.source_slug
        ?? existing.active_source_slug
        ?? existing.source_slug
        ?? null,
    };
  }

  return {
    ...existing,
    validation: mergeValidation(existing.validation, incoming.validation),
    attempts: mergeAttempts(existing.attempts, incoming.attempts),
    source_results: mergeSourceResults(existing.source_results, incoming.source_results),
    llm_used: Boolean(existing.llm_used) || Boolean(incoming.llm_used),
    requested_extraction_mode:
      incoming.requested_extraction_mode
      ?? existing.requested_extraction_mode
      ?? null,
  };
}

function shouldPromoteIncomingSnapshot(
  existingActiveSnapshot: ApprovedSourceSnapshotV1 | undefined,
  incomingSnapshot: ApprovedSourceSnapshotV1,
  options: MergeEnrichedSourceOptions,
): boolean {
  const incomingIsAccepted =
    options.incomingStatus === "success"
    || (options.incomingStatus === "partial" && incomingSnapshot.confidence.overall >= 0.6);

  if (!existingActiveSnapshot) {
    return true;
  }

  return incomingIsAccepted && isMeaningfulSnapshot(incomingSnapshot);
}

function pickActiveSourceSlug(
  approvedSources: Record<string, ApprovedSourceSnapshotV1>,
  existing: NormalizedEnrichedSourceV1 | null,
  incomingSourceSlug: string | null,
  options: MergeEnrichedSourceOptions,
): string | null {
  const existingActiveSourceSlug = canonicalizeSourceSlug(
    existing?.active_source_slug,
    existing?.source_type,
  ) ?? canonicalizeSourceSlug(existing?.source_slug, existing?.source_type);

  const existingActiveSnapshot = existingActiveSourceSlug
    ? approvedSources[existingActiveSourceSlug]
    : undefined;
  const incomingSnapshot = incomingSourceSlug
    ? approvedSources[incomingSourceSlug]
    : undefined;

  if (
    incomingSourceSlug
    && incomingSnapshot
    && shouldPromoteIncomingSnapshot(existingActiveSnapshot, incomingSnapshot, options)
  ) {
    return incomingSourceSlug;
  }

  if (existingActiveSourceSlug && approvedSources[existingActiveSourceSlug]) {
    return existingActiveSourceSlug;
  }

  if (incomingSourceSlug && approvedSources[incomingSourceSlug]) {
    return incomingSourceSlug;
  }

  const firstMeaningfulEntry = Object.entries(approvedSources).find(([, snapshot]) => isMeaningfulSnapshot(snapshot));
  if (firstMeaningfulEntry) {
    return firstMeaningfulEntry[0];
  }

  const firstEntry = Object.keys(approvedSources)[0];
  return firstEntry ?? null;
}

function buildTopLevelEnrichedSource(
  approvedSources: Record<string, ApprovedSourceSnapshotV1>,
  activeSourceSlug: string | null,
  fallbackExisting: NormalizedEnrichedSourceV1 | null,
  fallbackIncoming: ApprovedSourceSnapshotV1,
): ApprovedSourceSnapshotV1 {
  if (activeSourceSlug && approvedSources[activeSourceSlug]) {
    return approvedSources[activeSourceSlug];
  }

  const existingSnapshot = coerceSnapshot(fallbackExisting);
  if (existingSnapshot) {
    return existingSnapshot;
  }

  return fallbackIncoming;
}

function resolveRequestedExtractionMode(
  activeSnapshot: ApprovedSourceSnapshotV1,
  fallbackExisting: NormalizedEnrichedSourceV1 | null,
  fallbackIncoming: ApprovedSourceSnapshotV1,
): RequestedExtractionMode | null {
  return activeSnapshot.requested_extraction_mode
    ?? fallbackExisting?.requested_extraction_mode
    ?? fallbackIncoming.requested_extraction_mode
    ?? null;
}

export function mergeEnrichedSource(
  existingRaw: unknown,
  incoming: NormalizedEnrichedSourceV1,
  options: MergeEnrichedSourceOptions,
): NormalizedEnrichedSourceV1 {
  const existing = coerceNormalizedEnrichedSource(existingRaw);
  const incomingSnapshot = coerceSnapshot(incoming) ?? incoming;
  const incomingSourceSlug = canonicalizeSourceSlug(
    incoming.source_slug,
    incoming.source_type,
  ) ?? canonicalizeSourceSlug(
    incoming.active_source_slug,
    incoming.source_type,
  ) ?? (() => {
    const firstSourceResult = incoming.source_results?.find((entry) => canonicalizeSourceSlug(entry.sourceSlug, entry.sourceType));
    return firstSourceResult
      ? canonicalizeSourceSlug(firstSourceResult.sourceSlug, firstSourceResult.sourceType)
      : null;
  })();

  const approvedSources = {
    ...bootstrapLegacyApprovedSources(existing),
    ...getExistingApprovedSources(existing),
  };

  if (incomingSourceSlug) {
    approvedSources[incomingSourceSlug] = mergeSnapshot(
      approvedSources[incomingSourceSlug],
      {
        ...incomingSnapshot,
        source_slug: incomingSourceSlug,
        active_source_slug: incomingSourceSlug,
      },
      options,
    );
  }

  const activeSourceSlug = pickActiveSourceSlug(
    approvedSources,
    existing,
    incomingSourceSlug,
    options,
  );

  const activeSnapshot = buildTopLevelEnrichedSource(
    approvedSources,
    activeSourceSlug,
    existing,
    incomingSnapshot,
  );

  const aggregateSourceResults = mergeSourceResults(
    ...Object.values(approvedSources).map((snapshot) => snapshot.source_results),
    existing?.source_results,
    incoming.source_results,
  );

  return {
    ...activeSnapshot,
    source_slug: activeSnapshot.source_slug ?? activeSourceSlug,
    active_source_slug: activeSourceSlug,
    source_results: aggregateSourceResults.length > 0 ? aggregateSourceResults : activeSnapshot.source_results,
    approved_sources: Object.keys(approvedSources).length > 0 ? approvedSources : undefined,
    requested_extraction_mode: resolveRequestedExtractionMode(activeSnapshot, existing, incomingSnapshot),
  };
}

export function getApprovedSourceSnapshot(
  enrichedSource: unknown,
  sourceSlug: string,
): ApprovedSourceSnapshotV1 | null {
  const enriched = coerceNormalizedEnrichedSource(enrichedSource);
  if (!enriched) {
    return null;
  }

  const canonicalSourceSlug = canonicalizeSourceSlug(sourceSlug, "distributor") ?? sourceSlug;
  const approvedSources = {
    ...bootstrapLegacyApprovedSources(enriched),
    ...getExistingApprovedSources(enriched),
  };

  return approvedSources[canonicalSourceSlug] ?? null;
}

export function getApprovedSourceSnapshotSlugs(
  enrichedSource: unknown,
): string[] {
  const enriched = coerceNormalizedEnrichedSource(enrichedSource);
  if (!enriched) {
    return [];
  }

  const approvedSources = {
    ...bootstrapLegacyApprovedSources(enriched),
    ...getExistingApprovedSources(enriched),
  };

  return Object.keys(approvedSources);
}

export function isTerminalApprovedSourceFailure(
  warnings: string[] | undefined,
): boolean {
  const terminalTokens = [
    "AUTH_REQUIRED",
    "AUTH_FAILED",
    "AUTH_EXPIRED",
    "NO MATCH",
    "NO_MATCH",
    "POLICY_BLOCKED",
    "COULD NOT EXTRACT",
    "EXTRACTION FAILED",
    "UNABLE TO EXTRACT",
    "PRODUCT NOT FOUND",
    "NO RESULT",
  ];
  return (warnings ?? []).some((warning) => {
    const normalized = warning.toUpperCase();
    return terminalTokens.some((token) => normalized.includes(token));
  });
}

export function isMeaningfulApprovedSourceSnapshot(snapshot: unknown): boolean {
  return isMeaningfulSnapshot(coerceSnapshot(snapshot));
}
