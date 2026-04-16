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
            <div className="border-b-8 border-zinc-900 pb-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none">Account Dashboard</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">Welcome back, {profile?.full_name || user.email}</p>
            </div>

            {/* Buy Again Section */}
            <BuyAgainSection products={frequentProducts} />

            {/* Pet Recommendations Section */}
            {petRecommendations.length > 0 && (
                <section className="border-2 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                    <div className="bg-primary p-4 border-b-2 border-zinc-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Heart className="h-6 w-6 text-accent fill-accent" />
                            <h2 className="text-2xl font-black uppercase tracking-tight text-white font-display">Recommended for Your Pets</h2>
                        </div>
                        <Button variant="outline" size="sm" className="bg-white text-primary border border-zinc-900 rounded-none font-black uppercase text-xs" asChild>
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
                {/* Profile Card */}
                <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(59,130,246,1)] flex flex-col">
                    <div className="bg-blue-600 p-4 border-b-2 border-zinc-900 flex items-center justify-between text-white">
                        <h2 className="text-xl font-black uppercase tracking-tight font-display">Profile</h2>
                        <User className="h-5 w-5" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Full Name</span>
                            <span className="text-lg font-bold">{profile?.full_name || 'Not provided'}</span>
                        </div>
                        <div className="grid gap-1">
                            <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Email</span>
                            <span className="truncate font-bold">{user.email}</span>
                        </div>
                        <Button asChild variant="outline" className="w-full border border-zinc-900 rounded-none font-black uppercase tracking-tight hover:bg-zinc-100 mt-auto">
                            <Link href="/account/profile">Edit Profile</Link>
                        </Button>
                    </div>
                </div>

                {/* My Pets */}
                <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(22,163,74,1)] flex flex-col">
                    <div className="bg-green-600 p-4 border-b-2 border-zinc-900 flex items-center justify-between text-white">
                        <h2 className="text-xl font-black uppercase tracking-tight font-display">My Pets</h2>
                        <Dog className="h-5 w-5" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <div className="grid gap-1">
                            <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Registered Pets</span>
                            <span className="text-4xl font-black tracking-tighter">{pets.length}</span>
                        </div>
                        <div className="text-sm font-medium text-zinc-600 bg-zinc-50 p-3 border border-zinc-100">
                            {pets.length > 0 ? (
                                <p>
                                    Configured for: <span className="text-zinc-900 font-bold">{pets.slice(0, 3).map(p => p.name).join(', ')}</span>
                                    {pets.length > 3 && ` +${pets.length - 3} more`}
                                </p>
                            ) : (
                                <p>Add pets to get personalized product recommendations.</p>
                            )}
                        </div>
                        <Button asChild variant="outline" className="w-full border border-zinc-900 rounded-none font-black uppercase tracking-tight hover:bg-zinc-100 mt-auto">
                            <Link href="/account/pets">{pets.length > 0 ? 'Manage Pets' : 'Add a Pet'}</Link>
                        </Button>
                    </div>
                </div>

                {/* Recent Orders Card */}
                <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(220,38,38,1)] flex flex-col">
                    <div className="bg-red-600 p-4 border-b-2 border-zinc-900 flex items-center justify-between text-white">
                        <h2 className="text-xl font-black uppercase tracking-tight font-display">Recent Orders</h2>
                        <Package className="h-5 w-5" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        {recentOrders.length > 0 ? (
                            <div className="space-y-4">
                                {recentOrders.slice(0, 3).map((order) => (
                                    <div key={order.id} className="flex items-center justify-between p-3 border border-zinc-100 bg-zinc-50">
                                        <div className="flex flex-col">
                                            <span className="font-black text-sm uppercase">#{order.order_number}</span>
                                            <StatusBadge status={order.status} showIcon={false} className="h-5 text-[9px] w-fit mt-1 border border-zinc-200" />
                                        </div>
                                        <span className="font-black text-lg tracking-tight">{formatCurrency(Number(order.total))}</span>
                                    </div>
                                ))}
                                <Button asChild variant="link" className="p-0 h-auto font-black uppercase text-xs text-primary hover:no-underline hover:text-primary/80 flex items-center gap-1 mt-2">
                                    <Link href="/account/orders">View All Orders <ArrowRight className="h-3 w-3" /></Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <p className="font-bold text-zinc-500 uppercase text-xs tracking-widest">No orders yet</p>
                                <Button asChild variant="outline" className="mt-4 border border-zinc-900 rounded-none font-black uppercase tracking-tight hover:bg-zinc-100">
                                    <Link href="/products">Start Shopping</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Addresses Card */}
                <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(249,115,22,1)] flex flex-col">
                    <div className="bg-orange-600 p-4 border-b-2 border-zinc-900 flex items-center justify-between text-white">
                        <h2 className="text-xl font-black uppercase tracking-tight font-display">Addresses</h2>
                        <MapPin className="h-5 w-5" />
                    </div>
                    <div className="p-6 space-y-6 flex-1">
                        <p className="text-sm font-medium text-zinc-600">Manage your shipping and billing addresses for faster checkout.</p>
                        <Button asChild variant="outline" className="w-full border border-zinc-900 rounded-none font-black uppercase tracking-tight hover:bg-zinc-100 mt-auto">
                            <Link href="/account/addresses">Manage Addresses</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )

}
