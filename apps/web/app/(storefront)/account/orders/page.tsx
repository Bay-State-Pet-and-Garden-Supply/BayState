import { getOrders } from '@/lib/account/data'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Package, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatusBadge } from "@/components/ui/status-badge"
import { formatDate, formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = {
    title: 'Order History | Bay State Pet & Garden',
    description: 'View your past orders and their status.',
}

export default async function OrdersPage() {
    const orders = await getOrders()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Order History</h1>
                <p className="text-muted-foreground">View and manage your past orders.</p>
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
                <div className="grid gap-4">
                    {orders.map((order) => (
                        <Card key={order.id} className="overflow-hidden">
                            <CardHeader className="bg-muted/50 p-4 flex flex-row items-center justify-between space-y-0">
                                <div className="space-y-1">
                                    <CardTitle className="text-base">Order #{order.order_number}</CardTitle>
                                    <CardDescription>
                                        Placed on {formatDate(order.created_at)}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="font-semibold">{formatCurrency(Number(order.total))}</span>
                                    <StatusBadge status={order.status} />
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    <span className="hidden sm:inline">Order ID: {order.id}</span>
                                </div>
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/account/orders/${order.id}`}>
                                        Details
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
