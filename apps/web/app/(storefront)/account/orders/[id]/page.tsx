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
            <div className="border-b-2 border-brand-burgundy pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Link 
                        href="/account/orders" 
                        className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back to Orders
                    </Link>
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-zinc-900 font-display leading-tight">
                        Order #{order.order_number}
                    </h1>
                    <p className="text-zinc-600 font-medium text-sm mt-2">
                        Placed on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-brand-forest-dark text-white p-4 shadow-sm border-b-2 border-brand-burgundy overflow-hidden rounded-sm">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-200/80">Status:</span>
                    <StatusBadge status={order.status} className="border border-white/20 bg-white/10 text-white font-semibold text-xs" />
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    <div className="border border-zinc-200 rounded-lg bg-white shadow-sm overflow-hidden">
                        <div className="bg-brand-forest-dark p-4 border-b-2 border-brand-burgundy text-white">
                            <h2 className="text-xl font-bold font-display">Order Items</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-6">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-zinc-100 last:border-0 pb-6 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="font-bold text-lg leading-tight">{item.item_name}</p>
                                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">QTY: {item.quantity}</p>
                                        </div>
                                        <p className="text-2xl font-bold tracking-tight">{formatCurrency(Number(item.total_price))}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="border border-zinc-200 rounded-lg bg-white shadow-sm overflow-hidden">
                        <div className="bg-brand-forest-dark p-4 border-b-2 border-brand-burgundy text-white">
                            <h2 className="text-xl font-bold font-display">Summary</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-zinc-500">
                                <span>Subtotal</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.subtotal))}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold uppercase tracking-widest text-zinc-500">
                                <span>Tax</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.tax))}</span>
                            </div>
                            <div className="border-t-2 border-brand-burgundy pt-4 mt-4 flex justify-between">
                                <span className="text-lg font-bold font-display">Total</span>
                                <span className="text-3xl font-bold tracking-tight">{formatCurrency(Number(order.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div className="border border-zinc-200 rounded-lg bg-white shadow-sm overflow-hidden">
                        <div className="bg-brand-forest-dark p-4 border-b-2 border-brand-burgundy text-white">
                            <h2 className="text-xl font-bold font-display">Customer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Contact Info</span>
                                <p className="font-bold text-lg leading-tight break-all">{order.customer_email}</p>
                                {order.customer_phone && <p className="font-bold text-zinc-500 uppercase tracking-widest text-xs">TEL: {order.customer_phone}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
