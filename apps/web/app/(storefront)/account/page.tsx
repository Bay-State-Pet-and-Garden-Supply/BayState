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
        <div className="space-y-12">
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Account overview</p>
                <h1 className="storefront-section-title">Account dashboard</h1>
                <p className="storefront-section-copy mt-3">Welcome back, {profile?.full_name || user.email}</p>
            </div>

            <BuyAgainSection products={frequentProducts} />

            {petRecommendations.length > 0 && (
                <section className="storefront-panel overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-5">
                        <div className="flex items-center gap-2">
                            <Heart className="h-6 w-6 text-accent fill-accent" />
                            <h2 className="font-display text-2xl font-bold text-zinc-900">Recommended for your pets</h2>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-full bg-white text-primary" asChild>
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

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                <div className="storefront-panel flex flex-col">
                    <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900">
                        <h2 className="font-display text-xl font-bold">Profile</h2>
                        <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-medium tracking-[0.08em] text-zinc-500">Full name</span>
                            <span className="text-lg font-bold">{profile?.full_name || 'Not provided'}</span>
                        </div>
                        <div className="grid gap-1">
                            <span className="text-xs font-medium tracking-[0.08em] text-zinc-500">Email</span>
                            <span className="truncate font-bold">{user.email}</span>
                        </div>
                        <Button asChild variant="outline" className="mt-auto w-full rounded-xl">
                            <Link href="/account/profile">Edit Profile</Link>
                        </Button>
                    </div>
                </div>

                <div className="storefront-panel flex flex-col">
                    <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900">
                        <h2 className="font-display text-xl font-bold">My pets</h2>
                        <Dog className="h-5 w-5 text-primary" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-medium tracking-[0.08em] text-zinc-500">Registered pets</span>
                            <span className="text-4xl font-semibold tracking-tight text-zinc-900">{pets.length}</span>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-600">
                            {pets.length > 0 ? (
                                <p>
                                    Configured for: <span className="text-zinc-900 font-bold">{pets.slice(0, 3).map(p => p.name).join(', ')}</span>
                                    {pets.length > 3 && ` +${pets.length - 3} more`}
                                </p>
                            ) : (
                                <p>Add pets to get personalized product recommendations.</p>
                            )}
                        </div>
                        <Button asChild variant="outline" className="mt-auto w-full rounded-xl">
                            <Link href="/account/pets">{pets.length > 0 ? 'Manage Pets' : 'Add a Pet'}</Link>
                        </Button>
                    </div>
                </div>

                <div className="storefront-panel flex flex-col">
                    <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900">
                        <h2 className="font-display text-xl font-bold">Recent orders</h2>
                        <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        {recentOrders.length > 0 ? (
                            <div className="space-y-4">
                                {recentOrders.slice(0, 3).map((order) => (
                                    <div key={order.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-zinc-900">#{order.order_number}</span>
                                            <StatusBadge status={order.status} showIcon={false} className="h-5 text-[9px] w-fit mt-1 border border-zinc-200" />
                                        </div>
                                        <span className="text-lg font-semibold tracking-tight text-zinc-900">{formatCurrency(Number(order.total))}</span>
                                    </div>
                                ))}
                                <Button asChild variant="link" className="mt-2 flex h-auto items-center gap-1 p-0 text-xs font-medium text-primary hover:no-underline hover:text-primary/80">
                                    <Link href="/account/orders">View All Orders <ArrowRight className="h-3 w-3" /></Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <p className="text-xs font-medium tracking-[0.08em] text-zinc-500">No orders yet</p>
                                <Button asChild variant="outline" className="mt-4 rounded-xl">
                                    <Link href="/products">Start Shopping</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="storefront-panel flex flex-col">
                    <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900">
                        <h2 className="font-display text-xl font-bold">Addresses</h2>
                        <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <p className="text-sm font-medium text-zinc-600">Manage your shipping and billing addresses for faster checkout.</p>
                        <Button asChild variant="outline" className="mt-auto w-full rounded-xl">
                            <Link href="/account/addresses">Manage Addresses</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )

}
