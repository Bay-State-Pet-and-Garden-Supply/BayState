import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  getGeminiFeatureFlagAuditLog,
  getGeminiFeatureFlags,
  type GeminiFeatureFlags,
  upsertGeminiFeatureFlags,
} from '@/lib/config/gemini-feature-flags';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [flags, auditLog] = await Promise.all([
      getGeminiFeatureFlags(),
      getGeminiFeatureFlagAuditLog(),
    ]);

    return NextResponse.json({ flags, auditLog });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Gemini feature flags' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as Partial<GeminiFeatureFlags> & {
      reason?: string;
      source?: string;
    };

    const { reason, source, ...partialFlags } = body;
    const flags = await upsertGeminiFeatureFlags(partialFlags, auth.user.id, { reason, source });
    const auditLog = await getGeminiFeatureFlagAuditLog();

    return NextResponse.json({ success: true, flags, auditLog });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update Gemini feature flags' },
      { status: 500 }
    );
  }
}
