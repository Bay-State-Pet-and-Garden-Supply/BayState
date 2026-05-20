import { getOrderById } from '@/lib/orders'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { StatusBadge } from "@/components/ui/status-badge"
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

interface Props {
    params: Promise<{
        id: string
    }>
}

export const metadata = {
    title: 'Order Details | Bay State Pet & Garden',
}

export default async function OrderDetailsPage({ params }: Props) {
    const { id } = await params
    const order = await getOrderById(id)

    if (!order) {
        notFound()
    }

    // SECURITY: Verify order ownership
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || order.user_id !== user.id) {
        notFound()
    }

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Link 
                        href="/account/orders" 
                        className="inline-flex items-center text-sm font-semibold text-zinc-400 hover:text-primary transition-colors font-body"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back to Orders
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">
                        Order #{order.order_number}
                    </h1>
                    <p className="text-zinc-500 font-body">
                        Placed on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Status:</span>
                    <StatusBadge status={order.status} className="font-semibold text-xs" />
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                            <h2 className="text-lg font-bold font-display text-zinc-900">Order Items</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-6">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-zinc-50 last:border-0 pb-6 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="font-semibold text-base text-zinc-900 font-body">{item.item_name}</p>
                                            <p className="text-xs font-medium text-zinc-400 font-body">Quantity: {item.quantity}</p>
                                        </div>
                                        <p className="text-lg font-bold text-zinc-900">{formatCurrency(Number(item.total_price))}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                            <h2 className="text-lg font-bold font-display text-zinc-900">Summary</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between text-sm font-medium text-zinc-500 font-body">
                                <span>Subtotal</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.subtotal))}</span>
                            </div>
                            <div className="flex justify-between text-sm font-medium text-zinc-500 font-body">
                                <span>Tax</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.tax))}</span>
                            </div>
                            <div className="border-t border-zinc-100 pt-4 mt-4 flex justify-between items-end">
                                <span className="text-base font-bold font-display text-zinc-900">Total</span>
                                <span className="text-2xl font-bold tracking-tight text-zinc-900">{formatCurrency(Number(order.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                            <h2 className="text-lg font-bold font-display text-zinc-900">Customer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Contact Info</span>
                                <p className="font-medium text-base text-zinc-900 font-body break-all">{order.customer_email}</p>
                                {order.customer_phone && <p className="text-sm text-zinc-500 font-body">Phone: {order.customer_phone}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
