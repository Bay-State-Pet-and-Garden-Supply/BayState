import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-api-key-auth';
import { createAdminClient } from '@/lib/supabase/server';

export interface AdminAuthResult {
  authorized: true;
  user: { id: string; email?: string };
  role: 'admin' | 'staff';
}

export interface AdminAuthError {
  authorized: false;
  response: NextResponse;
}

/**
 * Validates that the current request includes a valid admin API key.
 * API-key-only auth — no JWT session fallback.
 *
 * The key can be provided via:
 *   X-API-Key: bsa_...
 *   Authorization: Bearer bsa_...
 *
 * Returns the authenticated user and their role from profiles.
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const auth = await requireAdminAuth(request);
 *   if (!auth.authorized) return auth.response;
 *   // ... rest of handler
 * }
 */
export async function requireAdminAuth(request: NextRequest): Promise<AdminAuthResult | AdminAuthError> {
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');

  const result = await validateAdminApiKey({
    apiKey,
    authorization: authHeader,
  });

  if (!result) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized — valid admin API key required' },
        { status: 401 }
      ),
    };
  }

  // Look up the user's role from profiles
  const supabase = await createAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', result.userId)
    .single();

  const role = profile?.role;

  if (!role || (role !== 'admin' && role !== 'staff')) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden: Admin or staff access required' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    user: { id: result.userId, email: profile?.email },
    role: role as 'admin' | 'staff',
  };
}

/**
 * Validates admin-only access (rejects staff).
 * Use for sensitive operations like user management or key administration.
 */
export async function requireAdminOnlyAuth(request: NextRequest): Promise<AdminAuthResult | AdminAuthError> {
  const result = await requireAdminAuth(request);

  if (!result.authorized) {
    return result;
  }

  if (result.role !== 'admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      ),
    };
  }

  return result;
}
