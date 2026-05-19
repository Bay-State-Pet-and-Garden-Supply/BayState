import { UserRound } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getUsers } from '@/lib/admin/users';
import { CustomersClient } from '@/components/admin/customers/CustomersClient';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = params.q || '';

  const { users, count } = await getUsers({
    page,
    search,
    limit: 10,
    role: 'customer',
  });

  return (
    <AdminPageShell
      title="Customers"
      description="Search customer records, review account details, and keep support work in one readable queue."
      icon={<UserRound className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <CustomersClient customers={users} count={count} />
    </AdminPageShell>
  );
}
