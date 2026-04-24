import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import {
  processTestResultCallback,
  validateTestCallbackPayload,
} from '@/lib/scraper-callback/test-handler';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const payloadResult = validateTestCallbackPayload(bodyText);

    if (!payloadResult.success) {
      return NextResponse.json(
        { error: payloadResult.error },
        { status: 400 }
      );
    }

    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      console.error('[TestCallback] Authentication failed');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`[TestCallback] Authenticated via ${runner.authMethod}: ${runner.runnerName}`);

    const supabase = getSupabaseAdmin();

    const result = await processTestResultCallback(supabase, payloadResult.payload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process test results' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      idempotent: result.idempotent,
      message: result.message,
      test_run_id: result.testRunId,
    });
  } catch (error) {
    console.error('[TestCallback] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}