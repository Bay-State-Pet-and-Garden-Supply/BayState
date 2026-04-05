export interface GeminiModelOption {
  value: string;
  label: string;
  description: string;
}

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Recommended default for most scraping and consolidation workloads.',
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
