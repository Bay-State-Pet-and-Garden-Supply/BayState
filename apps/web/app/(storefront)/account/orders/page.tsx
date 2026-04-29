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
        <div className="space-y-12">
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Purchases</p>
                <h1 className="storefront-section-title">Order history</h1>
                <p className="storefront-section-copy mt-3">View and manage your past orders.</p>
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
                <div className="grid gap-8">
                    {orders.map((order) => (
                        <div key={order.id} className="storefront-panel overflow-hidden">
                            <div className="flex flex-col gap-4 border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900 sm:flex-row sm:items-center sm:justify-between">
                                <div className="space-y-1">
                                    <h2 className="font-display text-xl font-bold">Order #{order.order_number}</h2>
                                    <p className="text-xs font-medium tracking-[0.08em] text-zinc-500">
                                        Placed on {formatDate(order.created_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-2xl font-semibold tracking-tight text-zinc-900">{formatCurrency(Number(order.total))}</span>
                                    <StatusBadge status={order.status} className="text-[10px]" />
                                </div>
                            </div>
                            <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-xs font-medium tracking-[0.08em] text-zinc-400">
                                    <span>Order ID: {order.id}</span>
                                </div>
                                <Button asChild variant="outline" className="w-full rounded-xl sm:w-auto">
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
