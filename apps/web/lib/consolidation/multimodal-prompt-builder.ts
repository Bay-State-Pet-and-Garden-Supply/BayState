/**
 * Gemini Multimodal Prompt Builder
 *
 * Builds Gemini Batch API JSONL request objects with:
 * - systemInstruction (text)
 * - multimodal user content (text evidence + up to 2 image fileData parts)
 * - JSON response configuration
 *
 * Each line in the JSONL corresponds to one UPC and references
 * Gemini File API URIs for images (never inline base64).
 */

import { generateSystemPrompt, buildUserPrompt } from './prompt-builder';
import { filterAllSources, buildPromptSourceEvidence } from './prompt-evidence';
import type { ProductSource } from './types';
import type { PreparedImagePart } from './image-prep';

// =============================================================================
// Types
// =============================================================================

export interface GeminiMultimodalContentPart {
  text?: string;
  fileData?: {
    fileUri: string;
    mimeType: string;
  };
}

export interface GeminiBatchJsonlLine {
  /** Stable correlation key matching the UPC */
  key: string;
  /** Gemini API request body */
  request: {
    /** The model resource name */
    model: string;
    /** System instruction (text-only) */
    systemInstruction?: {
      parts: Array<{ text: string }>;
    };
    /** Optional cached content resource name */
    cachedContent?: string;
    /** Contents (one user turn with text + optional images) */
    contents: Array<{
      role: string;
      parts: GeminiMultimodalContentPart[];
    }>;
    /** Generation config */
    generationConfig: {
      temperature: number;
      maxOutputTokens: number;
      responseMimeType: string;
    };
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 2048;

// =============================================================================
// Gemini Request Builder
// =============================================================================

/**
 * Build a single Gemini multimodal request object for a product.
 *
 * @param upc - Product UPC (used as correlation key)
 * @param systemPrompt - System prompt text (optional if using cachedContent)
 * @param userPrompt - User prompt text with source evidence
 * @param imageParts - Up to 2 prepared image fileData parts
 * @param model - Gemini model name (e.g. "gemini-3.5-flash")
 * @param config - Optional overrides including cachedContent name
 * @returns A GeminiBatchJsonlLine ready for JSONL serialization
 */
export function buildGeminiRequest(
  upc: string,
  systemPrompt: string | null,
  userPrompt: string,
  imageParts: PreparedImagePart[],
  model: string,
  config?: {
    temperature?: number;
    maxOutputTokens?: number;
    cachedContent?: string;
  }
): GeminiBatchJsonlLine {
  // Build user parts: text first, then images
  const parts: GeminiMultimodalContentPart[] = [{ text: userPrompt }];

  // Add up to 2 image fileData parts
  for (const img of imageParts.slice(0, 2)) {
    parts.push({
      fileData: {
        fileUri: img.fileUri,
        mimeType: img.mimeType,
      },
    });
  }

  const req: any = {
    model: model.startsWith('models/') ? model : `models/${model}`,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: config?.temperature ?? DEFAULT_TEMPERATURE,
      maxOutputTokens: config?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      responseMimeType: 'application/json',
    },
  };

  if (config?.cachedContent) {
    req.cachedContent = config.cachedContent;
  } else if (systemPrompt) {
    req.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  return {
    key: upc,
    request: req,
  };
}

// =============================================================================
// JSONL Builder
// =============================================================================

/**
 * Build a complete Gemini Batch JSONL string from products.
 *
 * @param products - Array of ProductSource to consolidate
 * @param imagePartsByUpc - Map of UPC → prepared image parts
 * @param model - Gemini model name
 * @param config - Optional overrides including cachedContent name
 * @returns Newline-delimited JSON string
 */
export function createGeminiBatchJsonl(
  products: ProductSource[],
  imagePartsByUpc: Map<string, PreparedImagePart[]>,
  categories: string[],
  model: string,
  config?: {
    temperature?: number;
    maxOutputTokens?: number;
    cachedContent?: string;
  }
): string {
  const systemPrompt = config?.cachedContent ? null : generateSystemPrompt(categories);
  const lines: string[] = [];

  for (const product of products) {
    // Build evidence (same as DeepSeek path, without images in text)
    const filteredSources = filterAllSources(product.sources);
    const sourceEvidence = buildPromptSourceEvidence(filteredSources);
    const userPrompt = buildUserPrompt(product, sourceEvidence);

    // Get image parts for this UPC
    const imageParts = imagePartsByUpc.get(product.upc) ?? [];

    const request = buildGeminiRequest(
      product.upc,
      systemPrompt,
      userPrompt,
      imageParts,
      model,
      config
    );

    lines.push(JSON.stringify(request));
  }

  return lines.join('\n');
}

/**
 * Parse a Gemini batch output JSONL line back to a per-UPC result.
 *
 * @param line - A single JSONL line from Gemini batch output
 * @returns The parsed output with key and response, or null on parse failure
 */
export function parseGeminiBatchOutputLine(line: string): {
  key: string;
  text?: string;
  error?: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
} | null {
  try {
    const parsed = JSON.parse(line);

    const key = parsed.key || parsed.custom_id || 'unknown';

    // Check for top-level error
    if (parsed.error) {
      return { key, error: parsed.error.message || 'Unknown batch error' };
    }

    // Navigate through response structure
    const response = parsed.response || parsed;
    const statusCode = response.statusCode ?? response.status_code ?? 200;

    if (statusCode !== 200) {
      return { key, error: `API error: ${statusCode}` };
    }

    // Extract from body or direct candidates
    const body = response.body || response;
    const candidates = body.candidates || [];

    if (candidates.length === 0) {
      return { key, error: 'No candidates in response' };
    }

    const candidate = candidates[0];
    const content = candidate.content || {};
    const parts = content.parts || [];

    // Collect text from all parts
    const textParts = parts
      .filter((p: { text?: string }) => p.text)
      .map((p: { text?: string }) => p.text);

    const text = textParts.join('\n').trim();

    // Extract usage from candidate-level or top-level usageMetadata
    const usage = candidate.usageMetadata || body.usageMetadata;

    if (!text) {
      return { key, error: 'Empty response content', usage };
    }

    return { key, text, usage };
  } catch (err) {
    return null;
  }
}

/**
 * Parse full Gemini batch output JSONL text into per-UPC results.
 */
export function parseGeminiBatchOutput(
  jsonlText: string
): Array<{
  key: string;
  text?: string;
  error?: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}> {
  const results = jsonlText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => parseGeminiBatchOutputLine(line));

  // Filter out null entries from unparseable lines
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
