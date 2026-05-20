import { getUserOrders } from '@/lib/account/data'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Package, ChevronRight } from 'lucide-react'
import { StatusBadge } from "@/components/ui/status-badge"
import { formatDate, formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = {
    title: 'Order History | Bay State Pet & Garden',
    description: 'View your past orders and their status.',
}

export default async function OrdersPage() {
    const orders = await getUserOrders()

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Order History</h1>
                <p className="text-zinc-500 font-body mt-1">View and manage your past orders.</p>
            </div>

            {orders.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title="No orders yet"
                    description="You haven't placed any orders yet. Start shopping to find great products for your pets and garden."
                    actionLabel="Start Shopping"
                    actionHref="/products"
                />
            ) : (
                <div className="grid gap-6">
                    {orders.map((order) => (
                        <div key={order.id} className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50">
                                <div className="space-y-1">
                                    <h2 className="text-lg font-bold font-display text-zinc-900">Order #{order.order_number}</h2>
                                    <p className="text-sm text-zinc-500 font-body">
                                        Placed on {formatDate(order.created_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-xl font-bold tracking-tight text-zinc-900">{formatCurrency(Number(order.total))}</span>
                                    <StatusBadge status={order.status} className="font-semibold text-[10px]" />
                                </div>
                            </div>
                            <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-xs font-medium text-zinc-400 font-body">
                                    <span>ID: {order.id}</span>
                                </div>
                                <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl font-semibold">
                                    <Link href={`/account/orders/${order.id}`}>
                                        View Details
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
