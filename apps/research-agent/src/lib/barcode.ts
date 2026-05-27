export function normalizeBarcode(value: string | number | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const digits = String(value).replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 14) return undefined;
  return digits;
}

export function normalizeBarcodes(values: Array<string | number | undefined | null>): string[] {
  return [...new Set(values.map((value) => normalizeBarcode(value)).filter((value): value is string => Boolean(value)))];
}
