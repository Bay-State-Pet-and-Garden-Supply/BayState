import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
 * Validates that the current request is from an authenticated admin or staff user.
 * Use this at the start of all /api/admin/* route handlers.
 *
 * @example
 * export async function GET() {
 *   const auth = await requireAdminAuth();
 *   if (!auth.authorized) return auth.response;
 *   // ... rest of handler
 * }
 */
export async function requireAdminAuth(): Promise<AdminAuthResult | AdminAuthError> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
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
    user: { id: user.id, email: user.email },
    role: role as 'admin' | 'staff',
  };
}

/**
 * Validates that the current request is from an admin user (not staff).
 * Use for sensitive operations like user management.
 */
export async function requireAdminOnlyAuth(): Promise<AdminAuthResult | AdminAuthError> {
  const result = await requireAdminAuth();

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
