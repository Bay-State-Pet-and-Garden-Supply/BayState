interface AIModelOption {
  value: string;
  label: string;
  description: string;
}

export const DEFAULT_AI_MODEL = 'deepseek-chat';
export const AI_MODEL_VALUES = [DEFAULT_AI_MODEL, 'deepseek-reasoner'] as const;

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    value: DEFAULT_AI_MODEL,
    label: 'DeepSeek Chat',
    description: 'Cost-efficient default for Bay State scraping, consolidation, and copilot flows.',
  },
  {
    value: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    description: 'Higher-effort reasoning for harder product cleanup and research tasks.',
  },
];

function getAIModelOption(value: string): AIModelOption | undefined {
  return AI_MODEL_OPTIONS.find((option) => option.value === value);
}

export function getAIModelLabel(value: string): string {
  return getAIModelOption(value)?.label ?? value;
}

type GeminiModelOption = AIModelOption;

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_MODEL_VALUES = [DEFAULT_GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-pro'] as const;

const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    value: DEFAULT_GEMINI_MODEL,
    label: 'Gemini 3.5 Flash',
    description: 'Primary Gemini model for multimodal consolidation via Batch API.',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Legacy Gemini default retained for historical compatibility only.',
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Legacy Gemini option retained for historical compatibility only.',
  },
];

function getGeminiModelOption(value: string): GeminiModelOption | undefined {
  return GEMINI_MODEL_OPTIONS.find((option) => option.value === value);
}

function getGeminiModelLabel(value: string): string {
  return getGeminiModelOption(value)?.label ?? value;
}
