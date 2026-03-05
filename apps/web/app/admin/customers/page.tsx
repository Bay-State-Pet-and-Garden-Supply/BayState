import { getUsers } from "@/lib/admin/users"
import { CustomersClient } from "@/components/admin/customers/CustomersClient"

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string }>
}) {
    const params = await searchParams
    const page = Number(params.page) || 1
    const search = params.q || ''

    // Fetch only users with role 'customer'
    // Note: Some legacy users might be 'customer' by default.
    const { users, count } = await getUsers({ 
        page, 
        search, 
        limit: 10,
        role: 'customer' 
    })

    return (
        <CustomersClient customers={users} count={count} />
    )
}
