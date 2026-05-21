import { getApprovedSourceSnapshotSlugs } from "@/lib/enrichment/merge-enriched-source";

export interface ProcessedSourceViewItem {
  key: string;
  label: string;
  sourceKey: string;
  data: Record<string, unknown> | null;
  deleteSourceKey: string | null;
  isEnriched: boolean;
  isVirtual: boolean;
  sourceSlug?: string | null;
  isDefault?: boolean;
}

const SOURCE_FRIENDLY_NAMES: Record<string, string> = {
  bradley: "Bradley Caldwell",
  central_pet: "Central Pet",
  "central-pet": "Central Pet",
  orgill: "Orgill",
  phillips: "Phillips Pet",
  petfoodex: "Pet Food Experts",
  pet_food_experts: "Pet Food Experts",
  "pet-food-experts": "Pet Food Experts",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEnrichedSourceResultsLabel(enrichedSource: Record<string, unknown>): string {
  const sourceResults = Array.isArray(enrichedSource.source_results)
    ? enrichedSource.source_results
    : [];
  if (sourceResults.length === 0) {
    return "Enriched";
  }

  const names = Array.from(new Set(
    sourceResults
      .map((sourceResult) => isRecord(sourceResult) ? sourceResult.sourceSlug : null)
      .filter((sourceSlug): sourceSlug is string => typeof sourceSlug === "string" && sourceSlug.trim().length > 0)
      .map((sourceSlug) => formatPipelineSourceSlug(sourceSlug)),
  ));

  if (names.length === 0) {
    return "Enriched";
  }

  return `Enriched (${names.join(", ")})`;
}

export function formatPipelineSourceSlug(sourceSlug: string): string {
  const friendly = SOURCE_FRIENDLY_NAMES[sourceSlug.toLowerCase()];
  if (friendly) {
    return friendly;
  }

  return sourceSlug
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildProcessedSourceItems(
  rawSources: Record<string, unknown> | null | undefined,
): ProcessedSourceViewItem[] {
  const sources = rawSources ?? {};
  const items: ProcessedSourceViewItem[] = [];

  for (const [sourceKey, rawSource] of Object.entries(sources)) {
    if (sourceKey.startsWith("_")) {
      continue;
    }

    const sourceData = isRecord(rawSource) ? rawSource : null;
    if (sourceKey !== "enriched") {
      items.push({
        key: sourceKey,
        label: formatPipelineSourceSlug(sourceKey),
        sourceKey,
        data: sourceData,
        deleteSourceKey: sourceKey,
        isEnriched: false,
        isVirtual: false,
      });
      continue;
    }

    const approvedSourceSlugs = sourceData ? getApprovedSourceSnapshotSlugs(sourceData) : [];
    if (approvedSourceSlugs.length === 0) {
      items.push({
        key: sourceKey,
        label: sourceData ? getEnrichedSourceResultsLabel(sourceData) : "Enriched",
        sourceKey,
        data: sourceData,
        deleteSourceKey: null,
        isEnriched: true,
        isVirtual: false,
        isDefault: true,
      });
      continue;
    }

    const activeSourceSlug = typeof sourceData?.active_source_slug === "string"
      ? sourceData.active_source_slug
      : approvedSourceSlugs[0];
    const topLevelSourceKeys = new Set(
      Object.keys(sources).filter((sourceName) => sourceName !== 'enriched' && !sourceName.startsWith('_')),
    );
    const orderedSourceSlugs = [
      ...(approvedSourceSlugs.includes(activeSourceSlug) ? [activeSourceSlug] : []),
      ...approvedSourceSlugs.filter((sourceSlug) => sourceSlug !== activeSourceSlug).sort((left, right) => left.localeCompare(right)),
    ];

    orderedSourceSlugs.forEach((sourceSlug, index) => {
      if (topLevelSourceKeys.has(sourceSlug)) {
        return;
      }
      const approvedSources = isRecord(sourceData?.approved_sources)
        ? sourceData.approved_sources
        : null;
      const snapshot = approvedSources && isRecord(approvedSources[sourceSlug])
        ? approvedSources[sourceSlug] as Record<string, unknown>
        : null;

      items.push({
        key: `enriched:${sourceSlug}`,
        label: `${formatPipelineSourceSlug(sourceSlug)} (Enriched)`,
        sourceKey: "enriched",
        data: snapshot,
        deleteSourceKey: null,
        isEnriched: true,
        isVirtual: true,
        sourceSlug,
        isDefault: index === 0,
      });
    });

    items.push({
      key: "enriched:summary",
      label: "Enriched Summary",
      sourceKey: "enriched",
      data: sourceData,
      deleteSourceKey: null,
      isEnriched: true,
      isVirtual: true,
    });
  }

  return items;
}
