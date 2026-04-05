import type { GoogleGenAI } from '@google/genai';
import type {
  BatchRequestPayload,
  GenerateStructuredTextParams,
  GenerateStructuredTextResult,
  LLMClient,
  ProviderUsage,
} from './interfaces';

const DEFAULT_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('429')
    || message.includes('rate limit')
    || message.includes('quota')
    || message.includes('timeout')
    || message.includes('temporar')
    || message.includes('503')
    || message.includes('500')
  );
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetriableError(error) || attempt === DEFAULT_RETRY_ATTEMPTS) {
        throw error;
      }

      await delay(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}

function buildGenerateConfig(params: GenerateStructuredTextParams): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (params.systemInstruction) {
    config.systemInstruction = params.systemInstruction;
  }
  if (typeof params.temperature === 'number') {
    config.temperature = params.temperature;
  }
  if (typeof params.maxOutputTokens === 'number') {
    config.maxOutputTokens = params.maxOutputTokens;
  }
  if (params.responseJsonSchema) {
    config.responseMimeType = params.responseMimeType ?? 'application/json';
    config.responseJsonSchema = params.responseJsonSchema;
  }

  return config;
}

function extractUsage(rawResponse: unknown): ProviderUsage | undefined {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return undefined;
  }

  const usageMetadata = (rawResponse as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (!usageMetadata || typeof usageMetadata !== 'object') {
    return undefined;
  }

  const promptTokens =
    typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : undefined;
  const completionTokens =
    typeof usageMetadata.candidatesTokenCount === 'number'
      ? usageMetadata.candidatesTokenCount
      : undefined;
  const totalTokens =
    typeof usageMetadata.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : undefined;

  if (
    promptTokens === undefined
    && completionTokens === undefined
    && totalTokens === undefined
  ) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function buildGeminiBatchRequest(request: BatchRequestPayload): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {};

  if (typeof request.temperature === 'number') {
    generationConfig.temperature = request.temperature;
  }
  if (typeof request.maxOutputTokens === 'number') {
    generationConfig.max_output_tokens = request.maxOutputTokens;
  }
  if (request.responseJsonSchema) {
    generationConfig.response_mime_type = request.responseMimeType ?? 'application/json';
    generationConfig.response_json_schema = request.responseJsonSchema;
  }

  const batchRequest: Record<string, unknown> = {
    key: request.key,
    request: {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: request.prompt,
            },
          ],
        },
      ],
      ...(Object.keys(generationConfig).length > 0
        ? { generation_config: generationConfig }
        : {}),
    },
  };

  if (request.systemInstruction) {
    (batchRequest.request as Record<string, unknown>).system_instruction = {
      parts: [
        {
          text: request.systemInstruction,
        },
      ],
    };
  }

  if (request.metadata) {
    (batchRequest.request as Record<string, unknown>).metadata = request.metadata;
  }

  return batchRequest;
}

export function extractGeminiResponseText(rawResponse: unknown): string | undefined {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return undefined;
  }

  const response = rawResponse as {
    text?: string;
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  if (typeof response.text === 'string' && response.text.trim().length > 0) {
    return response.text;
  }

  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts;
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const joined = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return joined.length > 0 ? joined : undefined;
}

export class GeminiClientAdapter implements LLMClient {
  readonly provider = 'gemini' as const;

  private readonly apiKey: string;
  private aiPromise: Promise<GoogleGenAI> | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async getClient(): Promise<GoogleGenAI> {
    if (!this.aiPromise) {
      this.aiPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({
        apiKey: this.apiKey,
      }));
    }

    return this.aiPromise;
  }

  async generate(params: GenerateStructuredTextParams): Promise<GenerateStructuredTextResult> {
    const ai = await this.getClient();
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: params.model,
        contents: params.prompt,
        config: buildGenerateConfig(params),
      })
    );

    return {
      text: response.text ?? '',
      usage: extractUsage(response),
      raw: response,
    };
  }

  async stream(params: GenerateStructuredTextParams): Promise<AsyncGenerator<string>> {
    const ai = await this.getClient();
    const stream = await withRetry(() =>
      ai.models.generateContentStream({
        model: params.model,
        contents: params.prompt,
        config: buildGenerateConfig(params),
      })
    );

    async function* chunkStream(): AsyncGenerator<string> {
      for await (const chunk of stream) {
        if (typeof chunk.text === 'string' && chunk.text.length > 0) {
          yield chunk.text;
        }
      }
    }

    return chunkStream();
  }

  prepareBatchRequests(requests: BatchRequestPayload[]): string {
    return requests.map((request) => JSON.stringify(buildGeminiBatchRequest(request))).join('\n');
  }
}
