import { createClient } from '@/lib/supabase/server';
import { CheckoutClient } from '@/components/storefront/checkout/checkout-client';
import type { CheckoutUserData } from '@/lib/types';

async function getUserData(): Promise<CheckoutUserData | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return null;
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', user.id)
    .single();
  
  if (!profile) {
    return null;
  }
  
  return {
    fullName: profile.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
    email: profile.email || user.email || '',
    phone: profile.phone || user.user_metadata?.phone || '',
  };
}

export default async function CheckoutPage() {
  const userData = await getUserData();
  
  return <CheckoutClient userData={userData} />;
}
