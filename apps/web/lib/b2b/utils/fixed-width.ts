/**
 * Fixed-width file parser for legacy B2B data formats.
 * Used primarily by Orgill (HD1 format).
 */

export interface FieldDefinition {
  name: string;
  start: number;
  end: number;
  type?: 'string' | 'number' | 'implied-decimal';
  decimalPlaces?: number; // For implied-decimal type
  trim?: boolean;
}

export interface ParseOptions {
  /** Skip lines that don't start with this prefix */
  linePrefix?: string;
  /** Skip header lines (number of lines to skip) */
  skipLines?: number;
  /** Custom line filter function */
  lineFilter?: (line: string) => boolean;
}

/**
 * Parses a fixed-width format file into an array of objects.
 */
export function parseFixedWidth<T extends Record<string, unknown>>(
  content: string,
  fields: FieldDefinition[],
  options: ParseOptions = {}
): T[] {
  const lines = content.split('\n');
  const results: T[] = [];

  let linesToSkip = options.skipLines || 0;

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Skip header lines
    if (linesToSkip > 0) {
      linesToSkip--;
      continue;
    }

    // Apply prefix filter
    if (options.linePrefix && !line.startsWith(options.linePrefix)) {
      continue;
    }

    // Apply custom filter
    if (options.lineFilter && !options.lineFilter(line)) {
      continue;
    }

    // Parse the line
    const record = parseFixedWidthLine<T>(line, fields);
    if (record) {
      results.push(record);
    }
  }

  return results;
}

/**
 * Parses a single fixed-width line into an object.
 */
export function parseFixedWidthLine<T extends Record<string, unknown>>(
  line: string,
  fields: FieldDefinition[]
): T | null {
  if (!line || line.length === 0) return null;

  const record: Record<string, unknown> = {};

  for (const field of fields) {
    // Safely extract substring (handle lines shorter than expected)
    const rawValue = safeSubstring(line, field.start, field.end);
    
    // Apply trimming (default true)
    const trimmedValue = field.trim !== false ? rawValue.trim() : rawValue;

    // Convert based on type
    switch (field.type) {
      case 'number':
        record[field.name] = parseFloat(trimmedValue) || 0;
        break;
      case 'implied-decimal':
        // Handle prices stored as integers (e.g., 1999 = $19.99)
        const decimalPlaces = field.decimalPlaces ?? 2;
        const divisor = Math.pow(10, decimalPlaces);
        record[field.name] = (parseInt(trimmedValue, 10) || 0) / divisor;
        break;
      default:
        record[field.name] = trimmedValue;
    }
  }

  return record as T;
}

/**
 * Safely extracts a substring, handling out-of-bounds indices.
 */
function safeSubstring(str: string, start: number, end: number): string {
  if (start >= str.length) return '';
  const safeEnd = Math.min(end, str.length);
  return str.substring(start, safeEnd);
}

/**
 * Pre-defined field layouts for common B2B formats.
 */
export const ORGILL_HD1_FIELDS: FieldDefinition[] = [
  { name: 'recordType', start: 0, end: 3, type: 'string' },
  { name: 'distributorSku', start: 3, end: 15, type: 'string' },
  { name: 'upc', start: 15, end: 27, type: 'string' },
  { name: 'name', start: 27, end: 60, type: 'string' },
  { name: 'price', start: 60, end: 68, type: 'implied-decimal', decimalPlaces: 2 },
  { name: 'cost', start: 68, end: 76, type: 'implied-decimal', decimalPlaces: 2 },
  { name: 'quantity', start: 76, end: 82, type: 'number' },
];

/**
 * Helper to create HD1 field layout with custom offsets.
 * Use this when Orgill changes their format.
 */
export function createHD1Layout(customOffsets?: Partial<Record<string, { start: number; end: number }>>): FieldDefinition[] {
  const defaults = [...ORGILL_HD1_FIELDS];
  
  if (customOffsets) {
    for (const field of defaults) {
      const custom = customOffsets[field.name];
      if (custom) {
        field.start = custom.start;
        field.end = custom.end;
      }
    }
  }

  return defaults;
}
