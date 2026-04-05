import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { GoogleGenAI } from '@google/genai';
import type {
  BatchJobStateResult,
  BatchProvider,
  BatchResultRecord,
  BatchSubmissionResult,
  ProviderUsage,
} from './interfaces';
import { extractGeminiResponseText } from './gemini-client';

function parseUsage(rawResponse: unknown): ProviderUsage | undefined {
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

function resolveBatchState(state: unknown): string {
  const normalizedState = typeof state === 'string' ? state.toUpperCase() : String(state ?? '').toUpperCase();

  switch (normalizedState) {
    case 'JOB_STATE_QUEUED':
    case 'QUEUED':
      return 'pending';
    case 'JOB_STATE_PENDING':
    case 'PENDING':
      return 'validating';
    case 'JOB_STATE_RUNNING':
    case 'RUNNING':
    case 'JOB_STATE_CANCELLING':
    case 'CANCELLING':
      return 'in_progress';
    case 'JOB_STATE_SUCCEEDED':
    case 'SUCCEEDED':
      return 'completed';
    case 'JOB_STATE_FAILED':
    case 'FAILED':
      return 'failed';
    case 'JOB_STATE_CANCELLED':
    case 'CANCELLED':
      return 'cancelled';
    case 'JOB_STATE_EXPIRED':
    case 'EXPIRED':
      return 'expired';
    default:
      return 'pending';
  }
}

function getBatchOutputFileName(batch: {
  dest?: {
    fileName?: string;
  };
}): string | null {
  return typeof batch.dest?.fileName === 'string' && batch.dest.fileName.length > 0
    ? batch.dest.fileName
    : null;
}

function getBatchInputFileName(batch: {
  src?: unknown;
}): string | null {
  const src = batch.src;
  if (typeof src === 'string' && src.length > 0) {
    return src;
  }
  if (src && typeof src === 'object' && 'fileName' in src) {
    const fileName = (src as { fileName?: unknown }).fileName;
    return typeof fileName === 'string' && fileName.length > 0 ? fileName : null;
  }
  return null;
}

function normalizeBatchError(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return 'Unknown Gemini batch error';
}

function parseResultLine(line: string): BatchResultRecord | null {
  if (!line.trim()) {
    return null;
  }

  const parsed = JSON.parse(line) as Record<string, unknown>;
  const key =
    typeof parsed.key === 'string'
      ? parsed.key
      : typeof parsed.custom_id === 'string'
        ? parsed.custom_id
        : parsed.metadata && typeof parsed.metadata === 'object'
          ? typeof (parsed.metadata as { key?: unknown }).key === 'string'
            ? ((parsed.metadata as { key?: string }).key ?? 'unknown')
            : 'unknown'
          : 'unknown';

  if (parsed.error) {
    return {
      key,
      error: normalizeBatchError(parsed.error),
      raw: parsed,
    };
  }

  const response = parsed.response;
  const text = extractGeminiResponseText(response);

  return {
    key,
    ...(text ? { text } : {}),
    ...(parseUsage(response) ? { usage: parseUsage(response) } : {}),
    raw: parsed,
  };
}

export class GeminiBatchProvider implements BatchProvider {
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

  async submitBatch(params: {
    model: string;
    displayName: string;
    content: string;
  }): Promise<BatchSubmissionResult> {
    const ai = await this.getClient();
    const file = new File([params.content], `${params.displayName}.jsonl`, {
      type: 'application/jsonl',
    });

    const uploadedFile = await ai.files.upload({
      file,
      config: {
        mimeType: 'application/jsonl',
        displayName: params.displayName,
      },
    });

    if (!uploadedFile.name) {
      throw new Error('Gemini batch input upload did not return a file name');
    }

    const batch = await ai.batches.create({
      model: params.model,
      src: uploadedFile.name,
      config: {
        displayName: params.displayName,
      },
    });

    if (!batch.name) {
      throw new Error('Gemini batch creation did not return a batch name');
    }

    return {
      id: batch.name,
      status: resolveBatchState(batch.state),
      inputFileId: uploadedFile.name,
      outputFileId: getBatchOutputFileName(batch),
      model: batch.model,
      raw: batch,
    };
  }

  async getBatchStatus(batchId: string): Promise<BatchJobStateResult> {
    const ai = await this.getClient();
    const batch = await ai.batches.get({ name: batchId });

    return {
      id: batch.name ?? batchId,
      status: resolveBatchState(batch.state),
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      inputFileId: getBatchInputFileName(batch),
      outputFileId: getBatchOutputFileName(batch),
      errorFileId: null,
      model: batch.model,
      raw: batch,
    };
  }

  async retrieveResults(batchId: string): Promise<BatchResultRecord[]> {
    const ai = await this.getClient();
    const batch = await ai.batches.get({ name: batchId });
    const results: BatchResultRecord[] = [];

    if (Array.isArray(batch.dest?.inlinedResponses)) {
      for (const response of batch.dest.inlinedResponses) {
        if (response.error) {
          results.push({
            key:
              typeof response.metadata?.key === 'string' ? response.metadata.key : 'unknown',
            error: normalizeBatchError(response.error),
            raw: response,
          });
          continue;
        }

        results.push({
          key:
            typeof response.metadata?.key === 'string' ? response.metadata.key : 'unknown',
          text: response.response?.text ?? '',
          ...(parseUsage(response.response) ? { usage: parseUsage(response.response) } : {}),
          raw: response,
        });
      }

      return results;
    }

    const resultFileName = getBatchOutputFileName(batch);
    if (!resultFileName) {
      return results;
    }

    const downloadPath = path.join(
      os.tmpdir(),
      `gemini-batch-${crypto.randomUUID()}.jsonl`
    );

    try {
      await ai.files.download({
        file: resultFileName,
        downloadPath,
      });

      const fileContent = await fs.readFile(downloadPath, 'utf8');
      for (const line of fileContent.split('\n')) {
        const parsed = parseResultLine(line);
        if (parsed) {
          results.push(parsed);
        }
      }
    } finally {
      await fs.unlink(downloadPath).catch(() => undefined);
    }

    return results;
  }

  async cancelBatch(batchId: string): Promise<void> {
    const ai = await this.getClient();
    await ai.batches.cancel({ name: batchId });
  }
}
