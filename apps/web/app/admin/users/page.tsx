import { Users } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getUsers } from '@/lib/admin/users';
import { AdminUsersClient } from '@/components/admin/users/AdminUsersClient';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = params.q || '';

  const { users, count } = await getUsers({ page, search, limit: 10 });

  return (
    <AdminPageShell
      title="Users"
      description="Manage staff access, roles, and account details without leaving the main admin workflow."
      icon={<Users className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <AdminUsersClient users={users} count={count} />
    </AdminPageShell>
  );
}
