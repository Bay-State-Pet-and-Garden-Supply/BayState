import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-api-key-auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';

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
 * Validates that the current request includes a valid admin API key OR a valid session.
 * Fallback to JWT session auth if API key is missing.
 *
 * Returns the authenticated user and their role from profiles.
 */
export async function requireAdminAuth(request: NextRequest): Promise<AdminAuthResult | AdminAuthError> {
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');

  // 1. Try API Key Auth
  const result = await validateAdminApiKey({
    apiKey,
    authorization: authHeader,
  });

  let userId: string | undefined;

  if (result) {
    userId = result.userId;
  } else {
    // 2. Fallback to Session Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      userId = user.id;
    }
  }

  if (!userId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized — valid admin API key or session required' },
        { status: 401 }
      ),
    };
  }

  // Look up the user's role from profiles
  const adminClient = await createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
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
    user: { id: userId, email: profile?.email },
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
