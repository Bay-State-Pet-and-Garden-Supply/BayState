import { getUsers } from "@/lib/admin/users"
import { AdminUsersClient } from "@/components/admin/users/AdminUsersClient"

export default async function AdminUsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const search = params.q || ''

    const { users, count } = await getUsers({ page, search, limit: 10 })

    return (
        <AdminUsersClient users={users} count={count} />
    )
}
