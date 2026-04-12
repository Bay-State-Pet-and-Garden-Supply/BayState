export function formatPipelineBatchLabel(
  cohortId: string,
  cohortName?: string | null,
): string {
  if (cohortId === "ungrouped") {
    return "Ungrouped";
  }

  const trimmedName = cohortName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return `Batch ${cohortId.slice(0, 8)}`;
}
