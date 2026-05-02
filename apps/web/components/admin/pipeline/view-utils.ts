export function formatPipelineBatchLabel(
  cohortId: string,
  cohortName?: string | null,
): string {
  if (cohortId === "ungrouped") {
    return "Ungrouped Products";
  }

  const trimmedName = cohortName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return `Cohort ${cohortId.slice(0, 8)}`;
}
