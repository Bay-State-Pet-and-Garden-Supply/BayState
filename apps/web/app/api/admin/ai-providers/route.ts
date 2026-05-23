import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  listAIProviderConfigs,
  createAIProviderConfig,
  updateAIProviderConfig,
  setActiveAIProviderConfig,
  AIProviderConfig,
} from '@/lib/ai-scraping/credentials';
import { decryptSecret } from '@/lib/ai-scraping/credentials';

// Helper to mask key securely
function getMaskedKey(config: AIProviderConfig): string {
  try {
    const key = decryptSecret({
      encryptedValue: config.encrypted_key,
      iv: config.iv,
      authTag: config.auth_tag,
    });
    if (!key) return '••••••••••••';
    const last4 = key.slice(-4);
    return `••••••••••••${last4}`;
  } catch {
    return '••••••••••••';
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const configs = await listAIProviderConfigs();
    const sanitized = configs.map((c) => ({
      id: c.id,
      name: c.name,
      provider_type: c.provider_type,
      base_url: c.base_url,
      default_model: c.default_model,
      is_active: c.is_active,
      is_active_for_consolidation: c.is_active_for_consolidation,
      api_key: getMaskedKey(c),
      updated_at: c.updated_at,
    }));

    return NextResponse.json({ success: true, configs: sanitized });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch AI provider profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json() as {
      id?: string;
      name: string;
      provider_type: any;
      base_url: string | null;
      default_model: string;
      api_key: string;
      use_for_extraction?: boolean;
      use_for_consolidation?: boolean;
    };

    if (!body.name || !body.provider_type || !body.default_model) {
      return NextResponse.json(
        { error: 'Missing required fields: name, provider_type, and default_model are required.' },
        { status: 400 }
      );
    }

    if (body.id) {
      // Update
      const payload: any = {
        name: body.name,
        provider_type: body.provider_type,
        base_url: body.base_url,
        default_model: body.default_model,
      };
      if (body.api_key && body.api_key !== '••••••••••••' && !body.api_key.startsWith('••••••••••••')) {
        payload.api_key = body.api_key;
      }
      const updated = await updateAIProviderConfig(body.id, payload, auth.user.id);

      // Handle usage flag changes
      if (body.use_for_extraction === true) {
        await setActiveAIProviderConfig(body.id, auth.user.id).catch(() => {});
      }

      return NextResponse.json({ success: true, config: { ...updated, api_key: getMaskedKey(updated) } });
    } else {
      // Create
      if (!body.api_key) {
        return NextResponse.json(
          { error: 'API key is required when creating a new profile.' },
          { status: 400 }
        );
      }
      const created = await createAIProviderConfig(
        {
          name: body.name,
          provider_type: body.provider_type,
          base_url: body.base_url,
          default_model: body.default_model,
          api_key: body.api_key,
        },
        auth.user.id
      );

      // Handle usage flags after creation
      if (body.use_for_extraction === true) {
        await setActiveAIProviderConfig(created.id, auth.user.id).catch(() => {});
      }
      if (body.use_for_consolidation === true) {
        const { setActiveConsolidationAIProviderConfig } = await import('@/lib/ai-scraping/credentials');
        await setActiveConsolidationAIProviderConfig(created.id, auth.user.id).catch(() => {});
      }

      return NextResponse.json({ success: true, config: { ...created, api_key: getMaskedKey(created) } });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save AI provider profile',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
