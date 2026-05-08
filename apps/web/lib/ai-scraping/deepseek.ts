export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDeepSeekBaseURL(value?: string | null): string {
  const normalized = trimToNull(value) ?? trimToNull(process.env.DEEPSEEK_BASE_URL);
  if (!normalized) {
    return DEFAULT_DEEPSEEK_BASE_URL;
  }

  return normalized.replace(/\/+$/, '').replace(/\/v1$/i, '');
}

export function getDeepSeekOpenAICompatibleBaseURL(value?: string | null): string {
  const baseURL = getDeepSeekBaseURL(value);
  return `${baseURL}/v1`;
}
