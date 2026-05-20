import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/roles'
import { getFrequentlyBoughtProducts, getRecentOrders } from '@/lib/account/reorder'
import { getPersonalizedProducts } from '@/lib/recommendations'
import { Button } from '@/components/ui/button'
import { BuyAgainSection } from '@/components/account/buy-again-section'
import { ProductCard } from '@/components/storefront/product-card'
import Link from 'next/link'
import { StatusBadge } from "@/components/ui/status-badge"
import { Package, User, MapPin, Dog, Heart, ArrowRight } from 'lucide-react'
import { getUserPets } from '@/lib/account/pets'
import { formatCurrency } from '@/lib/utils'

export default async function AccountPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const [profile, frequentProducts, recentOrders, pets, petRecommendations] = await Promise.all([
        getProfile(user.id),
        getFrequentlyBoughtProducts(6),
        getRecentOrders(5),
        getUserPets(),
        getPersonalizedProducts(user.id, 4)
    ])

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Account Dashboard</h1>
                <p className="text-zinc-500 font-body mt-1">Welcome back, {profile?.full_name || user.email}</p>
            </div>

            <BuyAgainSection products={frequentProducts} />

            {petRecommendations.length > 0 && (
                <section className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-white to-primary/5 p-6 border-b border-zinc-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Heart className="h-6 w-6 text-primary fill-primary/10" />
                            <h2 className="text-xl font-bold font-display text-zinc-900">Recommended for Your Pets</h2>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-xl font-semibold text-xs" asChild>
                            <Link href="/products">
                                View More
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                    <div className="p-6 grid gap-6 grid-cols-2 md:grid-cols-4">
                        {petRecommendations.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                </section>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <h2 className="text-lg font-bold font-display text-zinc-900">Profile</h2>
                        <User className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Full Name</span>
                            <span className="text-base font-medium text-zinc-900">{profile?.full_name || 'Not provided'}</span>
                        </div>
                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Email</span>
                            <span className="truncate text-base font-medium text-zinc-900">{user.email}</span>
                        </div>
                        <Button asChild variant="outline" className="w-full rounded-xl font-semibold mt-auto">
                            <Link href="/account/profile">Edit Profile</Link>
                        </Button>
                    </div>
                </div>

                <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <h2 className="text-lg font-bold font-display text-zinc-900">My Pets</h2>
                        <Dog className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Registered Pets</span>
                            <span className="text-4xl font-bold text-zinc-900">{pets.length}</span>
                        </div>
                        <div className="text-sm text-zinc-600 bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                            {pets.length > 0 ? (
                                <p>
                                    Configured for: <span className="text-zinc-900 font-semibold">{pets.slice(0, 3).map(p => p.name).join(', ')}</span>
                                    {pets.length > 3 && ` +${pets.length - 3} more`}
                                </p>
                            ) : (
                                <p>Add pets to get personalized product recommendations.</p>
                            )}
                        </div>
                        <Button asChild variant="outline" className="w-full rounded-xl font-semibold mt-auto">
                            <Link href="/account/pets">{pets.length > 0 ? 'Manage Pets' : 'Add a Pet'}</Link>
                        </Button>
                    </div>
                </div>

                <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <h2 className="text-lg font-bold font-display text-zinc-900">Recent Orders</h2>
                        <Package className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        {recentOrders.length > 0 ? (
                            <div className="space-y-4">
                                {recentOrders.slice(0, 3).map((order) => (
                                    <div key={order.id} className="flex items-center justify-between p-4 border border-zinc-100 bg-zinc-50 rounded-xl">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-xs text-zinc-500 uppercase">#{order.order_number}</span>
                                            <StatusBadge status={order.status} showIcon={false} className="h-5 text-[10px] w-fit mt-1.5" />
                                        </div>
                                        <span className="font-bold text-lg text-zinc-900">{formatCurrency(Number(order.total))}</span>
                                    </div>
                                ))}
                                <Button asChild variant="link" className="p-0 h-auto font-semibold text-sm text-primary hover:no-underline flex items-center gap-1 mt-2">
                                    <Link href="/account/orders">View All Orders <ArrowRight className="h-4 w-4" /></Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <p className="font-semibold text-zinc-400 uppercase text-xs tracking-wider">No orders yet</p>
                                <Button asChild variant="outline" className="mt-4 rounded-xl font-semibold">
                                    <Link href="/products">Start Shopping</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <h2 className="text-lg font-bold font-display text-zinc-900">Addresses</h2>
                        <MapPin className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <p className="text-sm text-zinc-600 leading-relaxed">Manage your shipping and billing addresses for faster checkout.</p>
                        <Button asChild variant="outline" className="w-full rounded-xl font-semibold mt-auto">
                            <Link href="/account/addresses">Manage Addresses</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
