import type { LLMProvider } from '@/lib/ai-scraping/credentials';

export type ConsolidationProvider = LLMProvider;

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GenerateStructuredTextParams {
  model: string;
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  responseJsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateStructuredTextResult {
  text: string;
  usage?: ProviderUsage;
  raw: unknown;
}

export interface BatchRequestPayload {
  key: string;
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  responseJsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
}

export interface BatchSubmissionResult {
  id: string;
  status: string;
  inputFileId?: string | null;
  outputFileId?: string | null;
  errorFileId?: string | null;
  model?: string;
  metadata?: Record<string, unknown>;
  raw: unknown;
}

export interface BatchJobStateResult {
  id: string;
  status: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputFileId?: string | null;
  outputFileId?: string | null;
  errorFileId?: string | null;
  model?: string;
  metadata?: Record<string, unknown>;
  raw: unknown;
}

export interface BatchResultRecord {
  key: string;
  text?: string;
  error?: string;
  usage?: ProviderUsage;
  raw: unknown;
}

export interface LLMClient {
  readonly provider: ConsolidationProvider;
  generate(params: GenerateStructuredTextParams): Promise<GenerateStructuredTextResult>;
  stream(params: GenerateStructuredTextParams): Promise<AsyncGenerator<string>>;
  prepareBatchRequests(requests: BatchRequestPayload[]): string;
}

export interface BatchProvider {
  readonly provider: ConsolidationProvider;
  submitBatch(params: {
    model: string;
    displayName: string;
    content: string;
  }): Promise<BatchSubmissionResult>;
  getBatchStatus(batchId: string): Promise<BatchJobStateResult>;
  retrieveResults(batchId: string): Promise<BatchResultRecord[]>;
  cancelBatch(batchId: string): Promise<void>;
}
