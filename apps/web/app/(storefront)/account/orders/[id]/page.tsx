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
            <div className="border-b-8 border-zinc-900 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Link 
                        href="/account/orders" 
                        className="inline-flex items-center text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back to Orders
                    </Link>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">
                        Order #{order.order_number}
                    </h1>
                    <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm">
                        Placed on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-zinc-900 text-white p-4 shadow-[8px_8px_0px_rgba(220,38,38,1)]">
                    <span className="text-xs font-black uppercase tracking-widest text-zinc-400">STATUS:</span>
                    <StatusBadge status={order.status} className="border border-white/20 bg-white/10 text-white font-black uppercase text-xs" />
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    <div className="border-2 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
                        <div className="bg-zinc-900 p-4 border-b-2 border-zinc-900 text-white">
                            <h2 className="text-xl font-black uppercase tracking-tight font-display text-accent">Order Items</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-6">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-zinc-100 last:border-0 pb-6 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="font-black uppercase text-lg leading-none">{item.item_name}</p>
                                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">QTY: {item.quantity}</p>
                                        </div>
                                        <p className="text-2xl font-black tracking-tighter">{formatCurrency(Number(item.total_price))}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(220,38,38,1)]">
                        <div className="bg-red-600 p-4 border-b-2 border-zinc-900 text-white">
                            <h2 className="text-xl font-black uppercase tracking-tight font-display">Summary</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between text-sm font-bold uppercase tracking-tight text-zinc-500">
                                <span>Subtotal</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.subtotal))}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold uppercase tracking-tight text-zinc-500">
                                <span>Tax</span>
                                <span className="text-zinc-900">{formatCurrency(Number(order.tax))}</span>
                            </div>
                            <div className="border-t-2 border-zinc-900 pt-4 mt-4 flex justify-between">
                                <span className="text-lg font-black uppercase tracking-tighter font-display">Total</span>
                                <span className="text-3xl font-black tracking-tighter">{formatCurrency(Number(order.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-2 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
                        <div className="bg-zinc-900 p-4 border-b-2 border-zinc-900 text-white">
                            <h2 className="text-xl font-black uppercase tracking-tight font-display text-accent">Customer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">CONTACT INFO</span>
                                <p className="font-bold text-lg leading-tight break-all">{order.customer_email}</p>
                                {order.customer_phone && <p className="font-black text-zinc-500 uppercase tracking-widest text-xs">TEL: {order.customer_phone}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

