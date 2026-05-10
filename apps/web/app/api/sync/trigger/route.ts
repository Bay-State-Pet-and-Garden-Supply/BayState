import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Allowlisted sync types → workflow file mapping
const SYNC_TYPE_WORKFLOWS: Record<string, { workflow: string; inputs?: Record<string, string> }> = {
  register_inventory: { workflow: 'register-sync.yml' },
  shopsite_orders: { workflow: 'shopsite-sync.yml', inputs: { target: 'orders' } },
  shopsite_products: { workflow: 'shopsite-sync.yml', inputs: { target: 'products' } },
  shopsite_all: { workflow: 'shopsite-sync.yml', inputs: { target: 'all' } },
};

type SyncType = keyof typeof SYNC_TYPE_WORKFLOWS;

interface TriggerRequest {
  syncType: SyncType;
  inputs?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    // Auth: require authenticated admin/staff
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !['admin', 'staff'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse body
    const body: TriggerRequest = await request.json();
    if (!body.syncType || !SYNC_TYPE_WORKFLOWS[body.syncType]) {
      return NextResponse.json(
        { error: `Invalid sync type. Allowed: ${Object.keys(SYNC_TYPE_WORKFLOWS).join(', ')}` },
        { status: 400 }
      );
    }

    const config = SYNC_TYPE_WORKFLOWS[body.syncType];

    // Determine source type for sync run record
    const sourceType = body.syncType.startsWith('shopsite') ? 'shopsite' : 'integra';
    const sourceSystem = body.syncType.startsWith('shopsite') ? 'shopsite_15' : 'integra_register';
    const syncKind = body.syncType.includes('orders') ? 'orders'
      : body.syncType.includes('products') ? 'products'
      : 'inventory';

    // Create queued sync run for correlation
    const { data: syncRun, error: syncRunError } = await supabase
      .from('integration_sync_runs')
      .insert({
        source_type: sourceType,
        source_system: sourceSystem,
        sync_kind: syncKind,
        status: 'queued',
        created_by: user.id,
        metadata: {
          trigger_source: 'admin_ui',
          sync_type: body.syncType,
          github_workflow: config.workflow,
        },
      })
      .select('id')
      .single();

    if (syncRunError || !syncRun) {
      console.error('Failed to create sync run:', syncRunError);
      return NextResponse.json({ error: 'Failed to create sync run' }, { status: 500 });
    }

    // GitHub auth
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
    }

    const owner = process.env.GITHUB_OWNER || 'Bay-State-Pet-and-Garden-Supply';
    const repo = process.env.GITHUB_REPO || 'BayState';
    const ref = process.env.GITHUB_WORKFLOW_REF || process.env.GITHUB_DEFAULT_BRANCH || 'master';

    // Build inputs — always inject sync_run_id for script correlation
    const workflowInputs: Record<string, string> = {
      sync_run_id: syncRun.id,
      ...(config.inputs || {}),
      ...(body.inputs || {}),
    };

    // Dispatch to GitHub Actions
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${config.workflow}/dispatches`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: workflowInputs }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub dispatch failed:', errorText);

      // Mark sync run as failed so it doesn't hang in queued
      await supabase
        .from('integration_sync_runs')
        .update({ status: 'failed', error_summary: `GitHub dispatch failed: ${errorText.slice(0, 200)}` })
        .eq('id', syncRun.id);

      return NextResponse.json({ error: 'Failed to trigger sync workflow' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      syncRunId: syncRun.id,
      workflow: config.workflow,
      message: `${body.syncType} sync queued`,
    });
  } catch (error) {
    console.error('Sync trigger error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
