import { createClient } from '@/lib/supabase/server';
import { AdminServicesClient } from '@/components/admin/services/AdminServicesClient';
import { type Service } from '@/components/admin/services/ServiceModal';

export default async function AdminServicesPage() {
  const supabase = await createClient();
  const { data: services, count } = await supabase
    .from('services')
    .select('*', { count: 'exact' })
    .order('name');

  return (
    <AdminServicesClient
      initialServices={(services || []) as Service[]}
      totalCount={count || 0}
    />
  );
}
