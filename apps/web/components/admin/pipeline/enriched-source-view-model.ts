import {
  getApprovedSourceSnapshot,
  getApprovedSourceSnapshotSlugs,
  isMeaningfulApprovedSourceSnapshot,
} from "@/lib/enrichment/merge-enriched-source";

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

function orderSourceSlugs(sourceSlugs: string[], activeSourceSlug: string | null): string[] {
  return [
    ...(activeSourceSlug && sourceSlugs.includes(activeSourceSlug) ? [activeSourceSlug] : []),
    ...sourceSlugs.filter((sourceSlug) => sourceSlug !== activeSourceSlug),
  ];
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
  const enrichedSource = isRecord(sources.enriched) ? sources.enriched : null;
  const activeSourceSlug = typeof enrichedSource?.active_source_slug === "string"
    ? enrichedSource.active_source_slug
    : null;

  const topLevelSourceKeys = orderSourceSlugs(
    Object.keys(sources).filter((sourceKey) => sourceKey !== "enriched" && !sourceKey.startsWith("_")),
    activeSourceSlug,
  );

  topLevelSourceKeys.forEach((sourceKey, index) => {
    const rawSource = sources[sourceKey];
    const sourceData = isRecord(rawSource) ? rawSource : null;

    items.push({
      key: sourceKey,
      label: formatPipelineSourceSlug(sourceKey),
      sourceKey,
      data: sourceData,
      deleteSourceKey: sourceKey,
      isEnriched: false,
      isVirtual: false,
      isDefault: index === 0,
    });
  });

  if (!enrichedSource) {
    return items;
  }

  const meaningfulApprovedSourceSlugs = orderSourceSlugs(
    getApprovedSourceSnapshotSlugs(enrichedSource).filter((sourceSlug) => {
      if (topLevelSourceKeys.includes(sourceSlug)) {
        return false;
      }

      return isMeaningfulApprovedSourceSnapshot(
        getApprovedSourceSnapshot(enrichedSource, sourceSlug),
      );
    }),
    activeSourceSlug,
  );

  meaningfulApprovedSourceSlugs.forEach((sourceSlug, index) => {
    const snapshot = getApprovedSourceSnapshot(enrichedSource, sourceSlug);

    items.push({
      key: `enriched:${sourceSlug}`,
      label: formatPipelineSourceSlug(sourceSlug),
      sourceKey: "enriched",
      data: snapshot as Record<string, unknown> | null,
      deleteSourceKey: null,
      isEnriched: true,
      isVirtual: true,
      sourceSlug,
      isDefault: items.length === 0 && index === 0,
    });
  });

  return items;
}
