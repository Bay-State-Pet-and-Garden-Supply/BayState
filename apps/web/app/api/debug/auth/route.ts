import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ 
      authenticated: false, 
      error: error?.message || 'No user',
      cookies: await getCookieNames() 
    }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    userId: user.id,
    email: user.email,
    role: profile?.role,
    cookies: await getCookieNames()
  });
}

async function getCookieNames() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return cookieStore.getAll().map(c => c.name);
}
