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
            <div className="border-b border-[oklch(85%_0.03_160)] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Link 
                        href="/account/orders" 
                        className="inline-flex items-center text-xs font-medium tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back to Orders
                    </Link>
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight font-display leading-none text-foreground">
                        Order #{order.order_number}
                    </h1>
                    <p className="text-muted-foreground font-medium tracking-wide text-sm">
                        Placed on {new Date(order.created_at).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-[oklch(25%_0.02_90)] text-white p-4 shadow-sm rounded-sm">
                    <span className="text-xs font-medium tracking-wide text-[oklch(70%_0.02_90)]">STATUS:</span>
                    <StatusBadge status={order.status} className="border border-white/20 bg-white/10 text-white font-semibold text-xs" />
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                    <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-sm">
                        <div className="bg-[oklch(25%_0.02_90)] p-4 border-b border-[oklch(85%_0.03_160)] text-white">
                            <h2 className="text-xl font-semibold font-display text-accent">Order Items</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-6">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-[oklch(90%_0.02_160)] last:border-0 pb-6 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="font-semibold text-lg leading-tight">{item.item_name}</p>
                                            <p className="text-xs font-medium tracking-wide text-muted-foreground">QTY: {item.quantity}</p>
                                        </div>
                                        <p className="text-2xl font-bold tracking-tight">{formatCurrency(Number(item.total_price))}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-sm">
                        <div className="bg-[oklch(35%_0.08_160)] p-4 border-b border-[oklch(85%_0.03_160)] text-white">
                            <h2 className="text-xl font-semibold font-display">Summary</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between text-sm font-semibold tracking-tight text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="text-foreground">{formatCurrency(Number(order.subtotal))}</span>
                            </div>
                            <div className="flex justify-between text-sm font-semibold tracking-tight text-muted-foreground">
                                <span>Tax</span>
                                <span className="text-foreground">{formatCurrency(Number(order.tax))}</span>
                            </div>
                            <div className="border-t border-[oklch(85%_0.03_160)] pt-4 mt-4 flex justify-between">
                                <span className="text-lg font-bold tracking-tight font-display">Total</span>
                                <span className="text-3xl font-bold tracking-tight">{formatCurrency(Number(order.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-sm">
                        <div className="bg-[oklch(25%_0.02_90)] p-4 border-b border-[oklch(85%_0.03_160)] text-white">
                            <h2 className="text-xl font-semibold font-display text-accent">Customer</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact Info</span>
                                <p className="font-semibold text-lg leading-tight break-all">{order.customer_email}</p>
                                {order.customer_phone && <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">TEL: {order.customer_phone}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
