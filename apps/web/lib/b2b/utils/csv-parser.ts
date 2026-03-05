/**
 * CSV Parser for B2B data feeds.
 * Used by PFX and other distributors with CSV/flat-file exports.
 */

export interface CSVParseOptions {
  /** Delimiter character (default: ',') */
  delimiter?: string;
  /** Whether first row contains headers (default: true) */
  hasHeaders?: boolean;
  /** Custom header names (overrides first row if hasHeaders is true) */
  headers?: string[];
  /** Skip empty lines (default: true) */
  skipEmpty?: boolean;
  /** Trim whitespace from values (default: true) */
  trimValues?: boolean;
  /** Character used for quoting fields (default: '"') */
  quoteChar?: string;
}

export interface CSVParseResult<T = Record<string, string>> {
  success: boolean;
  data: T[];
  headers: string[];
  errors: string[];
}

/**
 * Parses CSV content into an array of objects.
 */
export function parseCSV<T = Record<string, string>>(
  content: string,
  options: CSVParseOptions = {}
): CSVParseResult<T> {
  const {
    delimiter = ',',
    hasHeaders = true,
    headers: customHeaders,
    skipEmpty = true,
    trimValues = true,
    quoteChar = '"',
  } = options;

  const errors: string[] = [];
  const lines = splitLines(content);
  const data: T[] = [];

  if (lines.length === 0) {
    return { success: true, data: [], headers: [], errors: [] };
  }

  // Determine headers
  let headers: string[];
  let startLine = 0;

  if (customHeaders) {
    headers = customHeaders;
  } else if (hasHeaders) {
    headers = parseLine(lines[0], delimiter, quoteChar, trimValues);
    startLine = 1;
  } else {
    // Generate numeric headers
    const firstRow = parseLine(lines[0], delimiter, quoteChar, trimValues);
    headers = firstRow.map((_, i) => `col${i}`);
  }

  // Parse data rows
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (skipEmpty && !line.trim()) continue;

    try {
      const values = parseLine(line, delimiter, quoteChar, trimValues);
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || '';
      }

      data.push(row as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Parse error';
      errors.push(`Line ${i + 1}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    data,
    headers,
    errors,
  };
}

/**
 * Parses a single CSV line, handling quoted fields.
 */
function parseLine(
  line: string,
  delimiter: string,
  quoteChar: string,
  trimValues: boolean
): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === quoteChar) {
      if (inQuotes && line[i + 1] === quoteChar) {
        // Escaped quote
        current += quoteChar;
        i += 2;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === delimiter && !inQuotes) {
      // End of field
      values.push(trimValues ? current.trim() : current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Add last field
  values.push(trimValues ? current.trim() : current);

  return values;
}

/**
 * Splits content into lines, handling different line endings.
 */
function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

/**
 * Maps CSV rows to a target type using a field mapping.
 */
export function mapCSVToType<T>(
  rows: Record<string, string>[],
  mapping: Record<keyof T, string | ((row: Record<string, string>) => unknown)>
): T[] {
  return rows.map(row => {
    const result: Partial<T> = {};

    for (const [targetKey, source] of Object.entries(mapping)) {
      if (typeof source === 'function') {
        result[targetKey as keyof T] = source(row) as T[keyof T];
      } else {
        result[targetKey as keyof T] = row[source as string] as T[keyof T];
      }
    }

    return result as T;
  });
}

/**
 * Standard column mappings for known B2B providers.
 */
export const PFX_COLUMN_MAP = {
  distributorSku: 'Item #',
  upc: 'UPC',
  name: 'Description',
  brand: 'Brand',
  category: 'Category',
  price: (row: Record<string, string>) => parseFloat(row['Retail Price'] || '0'),
  cost: (row: Record<string, string>) => parseFloat(row['Net Cost'] || '0'),
  quantity: (row: Record<string, string>) => parseInt(row['Qty Avail'] || '0', 10),
  weight: (row: Record<string, string>) => parseFloat(row['Weight'] || '0'),
};
