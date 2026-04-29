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
        <div className="space-y-12">
            <div className="flex flex-col gap-6 border-b border-[var(--surface-storefront-border)] pb-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-4">
                    <Link 
                        href="/account/orders" 
                        className="inline-flex items-center text-xs font-medium tracking-[0.08em] text-zinc-500 transition-colors hover:text-zinc-900"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back to Orders
                    </Link>
                    <h1 className="storefront-section-title">
                        Order #{order.order_number}
                    </h1>
                    <p className="storefront-section-copy text-sm">
                        Placed on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="storefront-panel-soft flex items-center gap-4 p-4">
                    <span className="text-xs font-medium tracking-[0.08em] text-zinc-500">Status</span>
                    <StatusBadge status={order.status} className="text-xs" />
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    <div className="storefront-panel overflow-hidden">
                        <div className="border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4">
                            <h2 className="font-display text-xl font-bold text-zinc-900">Order items</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-6">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-zinc-100 last:border-0 pb-6 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="text-lg font-semibold leading-none text-zinc-900">{item.item_name}</p>
                                            <p className="text-xs font-medium tracking-[0.08em] text-zinc-400">Qty: {item.quantity}</p>
                                        </div>
                                        <p className="text-2xl font-semibold tracking-tight text-zinc-900">{formatCurrency(Number(item.total_price))}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="storefront-panel overflow-hidden">
                        <div className="border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4">
                            <h2 className="font-display text-xl font-bold text-zinc-900">Summary</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between text-sm font-medium text-zinc-500">
                                <span>Subtotal</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.subtotal))}</span>
                            </div>
                            <div className="flex justify-between text-sm font-medium text-zinc-500">
                                <span>Tax</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.tax))}</span>
                            </div>
                            <div className="mt-4 flex justify-between border-t border-[var(--surface-storefront-border)] pt-4">
                                <span className="font-display text-lg font-bold text-zinc-900">Total</span>
                                <span className="text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(Number(order.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div className="storefront-panel overflow-hidden">
                        <div className="border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4">
                            <h2 className="font-display text-xl font-bold text-zinc-900">Customer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <span className="text-xs font-medium tracking-[0.08em] text-zinc-400">Contact info</span>
                                <p className="font-bold text-lg leading-tight break-all">{order.customer_email}</p>
                                {order.customer_phone && <p className="text-xs font-medium tracking-[0.08em] text-zinc-500">Tel: {order.customer_phone}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
