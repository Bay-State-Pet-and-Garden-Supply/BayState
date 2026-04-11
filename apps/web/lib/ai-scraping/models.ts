export interface AIModelOption {
  value: string;
  label: string;
  description: string;
}

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';
export const AI_MODEL_VALUES = [DEFAULT_AI_MODEL, 'gpt-4o'] as const;

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    value: DEFAULT_AI_MODEL,
    label: 'GPT-4o mini',
    description: 'Cost-efficient default for Bay State AI scraping and consolidation.',
  },
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Higher quality reasoning for tougher extraction and enrichment cases.',
  },
];

export function getAIModelOption(value: string): AIModelOption | undefined {
  return AI_MODEL_OPTIONS.find((option) => option.value === value);
}

export function getAIModelLabel(value: string): string {
  return getAIModelOption(value)?.label ?? value;
}

export type GeminiModelOption = AIModelOption;

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_MODEL_VALUES = [DEFAULT_GEMINI_MODEL, 'gemini-2.5-pro'] as const;

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    value: DEFAULT_GEMINI_MODEL,
    label: 'Gemini 2.5 Flash',
    description: 'Legacy Gemini default retained for historical compatibility only.',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Legacy Gemini option retained for historical compatibility only.',
  },
];

export function getGeminiModelOption(value: string): GeminiModelOption | undefined {
  return GEMINI_MODEL_OPTIONS.find((option) => option.value === value);
}

export function getGeminiModelLabel(value: string): string {
  return getGeminiModelOption(value)?.label ?? value;
}
