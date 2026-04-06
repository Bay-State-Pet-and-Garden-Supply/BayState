export interface GeminiModelOption {
  value: string;
  label: string;
  description: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_MODEL_VALUES = [DEFAULT_GEMINI_MODEL, 'gemini-2.5-pro'] as const;

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    value: DEFAULT_GEMINI_MODEL,
    label: 'Gemini 2.5 Flash',
    description: 'Validated default for the Bay State scraping and consolidation runtime.',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Higher quality reasoning for tougher extraction and enrichment cases.',
  },
];

export function getGeminiModelOption(value: string): GeminiModelOption | undefined {
  return GEMINI_MODEL_OPTIONS.find((option) => option.value === value);
}

export function getGeminiModelLabel(value: string): string {
  return getGeminiModelOption(value)?.label ?? value;
}
