import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  getAIConsolidationDefaults,
  getAIConsolidationRuntimeConfig,
} from '@/lib/ai-scraping/credentials';

interface LMStudioModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

interface ModelResponse {
  models: Array<{ id: string; label: string }>;
}

/**
 * GET /api/admin/consolidation/models
 * Fetch available models from the saved LM Studio provider configuration.
 * Requires admin auth.
 */
export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const defaults = await getAIConsolidationDefaults();

    if (defaults.llm_provider !== 'lmstudio' || !defaults.llm_base_url) {
      return NextResponse.json(
        { error: 'LM Studio is not configured. Save LM Studio base URL and API key first.' },
        { status: 400 }
      );
    }

    // Load runtime config to get the actual API key
    const runtime = await getAIConsolidationRuntimeConfig();
    const apiKey = runtime.llm_api_key || null;

    return await fetchModelsFromLmStudio(defaults.llm_base_url, apiKey);
  } catch (error) {
    console.error('[Consolidation Models] GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/consolidation/models
 * Preview available models from an unsaved LM Studio endpoint.
 * Body: { llm_base_url: string; api_key?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as {
      llm_base_url?: string;
      api_key?: string;
    };

    if (!body.llm_base_url || !body.llm_base_url.trim()) {
      return NextResponse.json(
        { error: 'LM Studio base URL is required' },
        { status: 400 }
      );
    }

    const baseUrl = body.llm_base_url.trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { error: 'Base URL must start with http:// or https://' },
        { status: 400 }
      );
    }

    return await fetchModelsFromLmStudio(baseUrl, body.api_key?.trim() || null);
  } catch (error) {
    console.error('[Consolidation Models] POST failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

/**
 * Call the LM Studio /v1/models endpoint and normalize the response.
 */
async function fetchModelsFromLmStudio(
  baseUrl: string,
  apiKeyOverride: string | null
): Promise<NextResponse<ModelResponse | { error: string }>> {
  // Normalize base URL — ensure it ends with /v1
  const normalizedBase = baseUrl.endsWith('/v1')
    ? baseUrl
    : baseUrl.replace(/\/?$/, '/v1');
  const modelsUrl = `${normalizedBase}/models`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use the provided API key
    if (apiKeyOverride) {
      headers['Authorization'] = `Bearer ${apiKeyOverride}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `LM Studio returned status ${response.status}. Check that the server is running and the API key is correct.`,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      object?: string;
      data?: LMStudioModel[] | string[];
    };

    const models: { id: string; label: string }[] = [];

    // LM Studio returns { object: "list", data: [{ id, object, created, owned_by }] }
    if (data.data && Array.isArray(data.data)) {
      for (const model of data.data) {
        if (typeof model === 'object' && model !== null && 'id' in model) {
          models.push({
            id: model.id,
            label: model.id,
          });
        }
      }
    }

    if (models.length === 0) {
      // Try alternative format: { object, data: string[] }
      if (Array.isArray(data.data) && data.data.length > 0 && typeof data.data[0] === 'string') {
        for (const modelId of data.data as string[]) {
          models.push({ id: modelId, label: modelId });
        }
      }
    }

    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'LM Studio request timed out after 10 seconds. Check that the server is running and reachable.' },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to reach LM Studio: ${message}` },
      { status: 502 }
    );
  }
}
