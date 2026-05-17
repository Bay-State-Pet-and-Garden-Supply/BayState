import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getAIScrapingProviderSecret } from '@/lib/ai-scraping/credentials';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const customBaseUrl = searchParams.get('base_url');
    const customApiKey = searchParams.get('api_key');

    if (!provider) {
      return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
    }

    // Resolve API key: either custom parameter or stored secret
    let apiKey = customApiKey || null;
    if (!apiKey) {
      apiKey = await getAIScrapingProviderSecret(provider as any);
    }

    // Fallbacks from environment variables if still not found
    if (!apiKey) {
      if (provider === 'deepseek') {
        apiKey = process.env.DEEPSEEK_API_KEY || null;
      } else if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY || null;
      } else if (provider === 'gemini') {
        apiKey = process.env.GEMINI_API_KEY || null;
      }
    }

    // Resolve Base URL: custom or from env or default
    let baseUrl = customBaseUrl || null;
    if (!baseUrl) {
      if (provider === 'deepseek') {
        baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
      } else if (provider === 'openai') {
        baseUrl = 'https://api.openai.com/v1';
      } else if (provider === 'gemini') {
        baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      } else if (provider === 'lmstudio') {
        baseUrl = 'http://localhost:1234/v1';
      } else if (provider === 'openai_compatible') {
        baseUrl = process.env.OPENAI_BASE_URL || '';
      }
    }

    if (!baseUrl) {
      return NextResponse.json({ error: 'Base URL not configured or provided' }, { status: 400 });
    }

    // Strip trailing slashes
    baseUrl = baseUrl.replace(/\/+$/, '');

    // DeepSeek, OpenAI, Gemini, LM Studio, etc.
    // Try base_url + '/models' or base_url + '/v1/models'
    const modelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`[AI Settings] Querying models from: ${modelsUrl}`);

    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000), // 5 seconds timeout
    });

    if (!res.ok) {
      throw new Error(`Endpoint returned status ${res.status}`);
    }

    const data = await res.json();
    
    // Parse models list. standard format is { data: [ { id: "model-name" } ] }
    if (data && Array.isArray(data.data)) {
      const models = data.data.map((m: any) => ({
        id: m.id || m.name || String(m),
        label: m.id || m.name || String(m),
      }));
      return NextResponse.json({ success: true, models });
    }

    return NextResponse.json({ success: true, models: [] });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to query models',
      models: [],
    });
  }
}
