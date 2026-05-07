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
            <div className="border-b border-zinc-200 pb-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter uppercase font-display leading-none text-zinc-900">Order History</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">View and manage your past orders.</p>
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
                        <div key={order.id} className="border border-zinc-200 rounded-lg bg-white shadow-sm overflow-hidden">
                            <div className="bg-muted p-4 border-b border-zinc-200 text-foreground flex flex-col sm:flex-row sm:items-center justify-between text-white gap-4">
                                <div className="space-y-1">
                                    <h2 className="text-xl font-semibold font-display">Order #{order.order_number}</h2>
                                    <p className="text-xs font-bold uppercase tracking-widest text-red-100">
                                        Placed on {formatDate(order.created_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-2xl font-bold tracking-tighter">{formatCurrency(Number(order.total))}</span>
                                    <StatusBadge status={order.status} className="border border-white/20 bg-white/10 text-white font-semibold text-[10px]" />
                                </div>
                            </div>
                            <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-xs font-semibold text-zinc-400">
                                    <span>Order ID: {order.id}</span>
                                </div>
                                <Button asChild variant="outline" className="w-full sm:w-auto border border-zinc-200 rounded-sm font-semibold hover:bg-zinc-100">
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
