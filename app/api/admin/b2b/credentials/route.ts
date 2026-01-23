import { NextRequest, NextResponse } from 'next/server';
import { getCredentials, saveCredentials, testConnection, getCredentialStatus, deleteCredentials } from '@/lib/b2b/credential-actions';
import { getFeedType, restCredentialSchema, sftpCredentialSchema, ediCredentialSchema } from '@/lib/b2b/credential-schema';
import { z } from 'zod';

const validDistributors = ['PHILLIPS', 'ORGILL', 'BCI', 'CENTRAL', 'PFX'] as const;

/**
 * GET /api/admin/b2b/credentials
 * Get credentials for a specific distributor or all credentials status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const distributorCode = searchParams.get('distributor');

    if (!distributorCode) {
      // Return status for all distributors
      const statuses = await Promise.all(
        validDistributors.map(async (code) => {
          const status = await getCredentialStatus(code);
          return {
            distributorCode: code,
            configured: status.configured,
            fields: status.fields,
          };
        })
      );
      return NextResponse.json({ credentials: statuses });
    }

    // Validate distributor code
    if (!validDistributors.includes(distributorCode as any)) {
      return NextResponse.json(
        { error: `Invalid distributor code: ${distributorCode}` },
        { status: 400 }
      );
    }

    // Get credentials for specific distributor
    const credentials = await getCredentials(distributorCode);
    
    if (!credentials) {
      return NextResponse.json({
        distributorCode,
        configured: false,
        credentials: null,
      });
    }

    return NextResponse.json({
      distributorCode,
      configured: true,
      credentials,
    });
  } catch (error) {
    console.error('[API] Failed to get credentials:', error);
    return NextResponse.json(
      { error: 'Failed to get credentials' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/b2b/credentials
 * Save credentials for a distributor
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { distributorCode, credentials } = body;

    // Validate distributor code
    if (!distributorCode || !validDistributors.includes(distributorCode as any)) {
      return NextResponse.json(
        { error: `Invalid distributor code: ${distributorCode}` },
        { status: 400 }
      );
    }

    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json(
        { error: 'Credentials object is required' },
        { status: 400 }
      );
    }

    // Validate credentials based on feed type
    const feedType = getFeedType(distributorCode);
    let schema;

    switch (feedType) {
      case 'REST':
        schema = restCredentialSchema;
        break;
      case 'SFTP':
        schema = sftpCredentialSchema;
        break;
      case 'EDI':
        schema = ediCredentialSchema;
        break;
    }

    const validationResult = schema.safeParse(credentials);
    
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return NextResponse.json(
        { error: 'Validation failed', validationErrors: errors },
        { status: 400 }
      );
    }

    // Save credentials
    const result = await saveCredentials(distributorCode, credentials);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      distributorCode,
      message: 'Credentials saved successfully',
    });
  } catch (error) {
    console.error('[API] Failed to save credentials:', error);
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/b2b/credentials
 * Delete credentials for a distributor
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const distributorCode = searchParams.get('distributor');

    if (!distributorCode || !validDistributors.includes(distributorCode as any)) {
      return NextResponse.json(
        { error: `Invalid distributor code: ${distributorCode}` },
        { status: 400 }
      );
    }

    const result = await deleteCredentials(distributorCode);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      distributorCode,
      message: 'Credentials deleted successfully',
    });
  } catch (error) {
    console.error('[API] Failed to delete credentials:', error);
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/b2b/credentials
 * Test connection for a distributor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { distributorCode, action } = body;

    // Validate distributor code
    if (!distributorCode || !validDistributors.includes(distributorCode as any)) {
      return NextResponse.json(
        { error: `Invalid distributor code: ${distributorCode}` },
        { status: 400 }
      );
    }

    if (action === 'test') {
      const result = await testConnection(distributorCode);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Failed to process credentials action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
