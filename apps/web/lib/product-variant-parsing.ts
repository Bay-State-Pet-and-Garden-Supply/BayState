const INPUT_NAME_SIZE_RE =
  /\b(?:(?:SM(?:ALL)?|MD|MED(?:IUM)?|LG|LRG|LARGE|XL|XXL)\s+)?(\d+(?:\.\d+)?)\s*(OZ|LB|LBS|CT|GAL|QT|PT|PK|IN|FT)\b/i;

const QUALIFIER_RE = /\b(SM(?:ALL)?|MD|MED(?:IUM)?|LG|LRG|LARGE|XL|XXL)\b/i;

const QUALIFIER_MAP: Record<string, string> = {
  SM: 'Small',
  SMALL: 'Small',
  MD: 'Medium',
  MED: 'Medium',
  MEDIUM: 'Medium',
  LG: 'Large',
  LRG: 'Large',
  LARGE: 'Large',
  XL: 'XL',
  XXL: 'XXL',
};

function extractQualifier(text: string): string | null {
  const qualifierMatch = text.match(QUALIFIER_RE);
  if (!qualifierMatch) return null;
  return QUALIFIER_MAP[qualifierMatch[1].toUpperCase()] || qualifierMatch[1];
}

/**
 * Extracts a size/weight descriptor from an abbreviated ShopSite/POS input name.
 * Examples:
 *   "PUPSICLE REFILL CALM ING BBQ SM 6OZ" → "Small 6 oz."
 *   "PUPSICLE REFILL CALM ING BBQ LG 8OZ" → "Large 8 oz."
 *   "HONEST KITCHEN BISCU ITS CHEDDAR 3.5OZ" → "3.5 oz."
 */
export function extractSizeFromInputName(inputName: string | undefined): string | null {
  if (!inputName || typeof inputName !== 'string') return null;

  const sizeMatch = inputName.match(INPUT_NAME_SIZE_RE);
  if (!sizeMatch) {
    return extractQualifier(inputName);
  }

  const number = sizeMatch[1];
  const unit = sizeMatch[2].toLowerCase();
  const unitMap: Record<string, string> = {
    oz: 'oz.',
    lb: 'lb.',
    lbs: 'lb.',
    ct: 'ct.',
    gal: 'gal.',
    qt: 'qt.',
    pt: 'pt.',
    pk: 'pk.',
    in: 'in.',
    ft: 'ft.',
  };
  const normalizedUnit = unitMap[unit] || `${unit}.`;
  const qualifier = extractQualifier(inputName);

  return qualifier ? `${qualifier} ${number} ${normalizedUnit}` : `${number} ${normalizedUnit}`;
}

/**
 * Extracts a variant descriptor from a general product title/name.
 * Preserves qualitative size when present so "Large 10 Count" and
 * "Small 10 Count" do not collapse to the same "10 ct" value.
 */
export function extractSizeFromProductTitle(title: string | undefined): string | null {
  if (!title || typeof title !== 'string') return null;

  const qualifier = extractQualifier(title);

  const sizeMatch = title.match(
    /\b(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|ml|gal|ounce|ounces|pound|pounds|gram|grams)\b/i,
  );
  if (sizeMatch) {
    const number = sizeMatch[1];
    const unit = sizeMatch[2].toLowerCase();
    const unitMap: Record<string, string> = {
      ounce: 'oz',
      ounces: 'oz',
      oz: 'oz',
      pound: 'lb',
      pounds: 'lb',
      lb: 'lb',
      lbs: 'lb',
      gram: 'g',
      grams: 'g',
      g: 'g',
      kg: 'kg',
      ml: 'ml',
      gal: 'gal',
    };
    const metric = `${number} ${unitMap[unit] || unit}`;
    return qualifier ? `${qualifier} ${metric}` : metric;
  }

  const countMatch = title.match(/\b(\d+)\s*(ct|count|pack|pk|bags|pieces)\b/i);
  if (countMatch) {
    const metric = `${countMatch[1]} ct`;
    return qualifier ? `${qualifier} ${metric}` : metric;
  }

  return qualifier;
}
