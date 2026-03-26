import { ArrowRight, Leaf, Dog, Flame } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { PetRecommendations } from '@/components/storefront/pet-recommendations';
import { HeroCarousel } from '@/components/storefront/hero-carousel';
import { getFeaturedProducts, getBrands } from '@/lib/data';
import { getHomepageSettings } from '@/lib/settings';

/**
 * HomePage - Main landing page for Bay State Pet & Garden Supply.
 * Features a modernized layout reminiscent of the original live site.
 */
export default async function HomePage() {
  const [featuredProducts, homepageSettings, brands] = await Promise.all([
    getFeaturedProducts(6),
    getHomepageSettings(),
    getBrands(),
  ]);

  const { heroSlides, heroSlideInterval } = homepageSettings;

  return (
    <div className="w-full max-w-none pt-0 pb-8">
      {/* Promotional Hero Carousel */}
      {heroSlides && heroSlides.length > 0 && (
        <div className="px-4 pt-4">
          <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
        </div>
      )}

      {/* Hero Section (fallback when no carousel) */}
      {(!heroSlides || heroSlides.length === 0) && (
        <section className="mb-12 bg-primary text-white py-16 text-center shadow-md">
          <div className="container mx-auto px-4">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl uppercase italic drop-shadow-md text-accent">
              Baby Chicks Are Here!
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-xl font-medium">
              Pick up in store today, or pre-order!
            </p>
            <Button size="lg" className="bg-accent text-secondary hover:bg-accent/90 text-lg font-bold px-8 py-6 rounded-md shadow-lg" asChild>
              <Link href="/products?category=farm">
                Shop Now
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4">
        {/* Promotional Banner Grid */}
        <section className="my-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/products?category=lawn-garden" className="group rounded-lg overflow-hidden relative h-48 sm:h-64 shadow-md transition-shadow hover:shadow-xl">
            <Image
              src="/images/categories/lawn-garden.jpg"
              alt="Seed Starting Supplies"
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <h3 className="text-white text-3xl font-serif font-bold italic mb-4 drop-shadow-md">Seed Starting</h3>
              <span className="uppercase tracking-widest text-white font-bold text-xl drop-shadow-md mb-4">Supplies</span>
              <span className="bg-transparent border-2 border-white text-white font-bold py-2 px-6 rounded hover:bg-white hover:text-black transition-colors">SHOP NOW</span>
            </div>
          </Link>
          <Link href="/products?category=farm" className="group rounded-lg overflow-hidden relative h-48 sm:h-64 shadow-md transition-shadow hover:shadow-xl bg-accent">
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 text-secondary">
              <h3 className="text-4xl font-bold mb-2">Bee Nuc&apos;s</h3>
              <span className="bg-black text-accent font-bold px-4 py-2 text-xl italic skew-x-[-10deg]">PRE-ORDER NOW</span>
            </div>
          </Link>
          <Link href="/products?category=home" className="group rounded-lg overflow-hidden relative h-48 sm:h-64 shadow-md transition-shadow hover:shadow-xl">
            <Image
              src="/images/categories/home.jpg"
              alt="Wood Pellets"
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center text-center">
              <span className="text-white font-bold text-sm bg-blue-500/80 px-2 py-1 mb-2">WHEN MOTHER NATURE BRINGS THE COLD...</span>
              <span className="text-accent italic font-bold text-xl mb-1">WE BRING THE HEAT!</span>
              <h3 className="text-white text-lg font-bold">WOOD PELLETS AVAILABLE</h3>
              <span className="mt-3 bg-red-600 text-white font-bold py-2 px-6 rounded-full hover:bg-red-700 transition-colors uppercase">Pre-Order Now</span>
            </div>
          </Link>
        </section>

        {/* Gift Shop Banner */}
        <section className="mb-12 rounded-lg bg-secondary text-accent p-6 sm:p-8 text-center shadow-lg border-4 border-accent overflow-hidden relative">
          <div className="flex flex-col items-center justify-center relative z-10">
            <h2 className="text-3xl sm:text-4xl font-serif mb-2">BAY STATE</h2>
            <h3 className="text-xl sm:text-2xl font-serif mb-6 uppercase tracking-widest">Country Gift Shop</h3>
            <p className="text-sm sm:text-base font-bold flex flex-wrap justify-center gap-x-2 gap-y-1 bg-accent text-secondary py-2 px-4 rounded">
              Unique Gifts &bull; Hand-Poured Soy Candles &bull; Goat Milk Soap &bull; Farm Fresh Eggs &bull; Local Raw Honey &bull; Old Fashioned Candy
            </p>
          </div>
        </section>

        {/* Bento Grid Categories */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-semibold text-zinc-900 flex items-center gap-2">
            Shop by Category
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="group cursor-pointer transition-all duration-[--animate-duration-slow] hover:shadow-lg lg:col-span-2 lg:row-span-2 border-primary/20 hover:border-primary/50">
              <CardContent className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
                <div className="mb-6 rounded-full bg-primary/10 p-6 flex items-center justify-center flex-none group-hover:scale-110 transition-transform">
                  <Dog className="h-16 w-16 text-primary" />
                </div>
                <h3 className="mb-3 text-3xl font-bold text-zinc-900">
                  Pet Supplies
                </h3>
                <p className="mb-6 text-zinc-600 max-w-sm">
                  Everything you need for your dogs, cats, small pets, birds, reptiles, and fish.
                </p>
                <Button variant="default" className="w-full sm:w-auto" asChild>
                  <Link href="/products?category=pet-supplies">
                    Shop Pet Supplies
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all duration-[--animate-duration-slow] hover:shadow-lg border-red-900/10 hover:border-red-900/30">
              <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 rounded-full bg-red-100 p-4">
                  <Leaf className="h-8 w-8 text-red-700" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900">Farm & Livestock</h3>
                <p className="text-sm text-zinc-600 mb-4">Horse, Poultry, Feed & Supplies</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/products?category=farm">Shop Farm <ArrowRight className="ml-1 h-3 w-3"/></Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all duration-[--animate-duration-slow] hover:shadow-lg border-green-900/10 hover:border-green-900/30">
              <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 rounded-full bg-green-100 p-4">
                  <Leaf className="h-8 w-8 text-green-700" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900">Lawn & Garden</h3>
                <p className="text-sm text-zinc-600 mb-4">Plants, Tools, Mulch & Control</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/products?category=lawn-garden">Shop Garden <ArrowRight className="ml-1 h-3 w-3"/></Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all duration-[--animate-duration-slow] hover:shadow-lg border-blue-900/10 hover:border-blue-900/30">
              <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 rounded-full bg-blue-100 p-4">
                  <Flame className="h-8 w-8 text-blue-700" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900">Home & Fuel</h3>
                <p className="text-sm text-zinc-600 mb-4">Wood Pellets, Coal, Propane</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/products?category=home">Shop Home <ArrowRight className="ml-1 h-3 w-3"/></Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer transition-all duration-[--animate-duration-slow] hover:shadow-lg border-orange-900/10 hover:border-orange-900/30">
              <CardContent className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 rounded-full bg-orange-100 p-4">
                  <Leaf className="h-8 w-8 text-orange-700" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900">Seasonal</h3>
                <p className="text-sm text-zinc-600 mb-4">Holiday Shoppe & More</p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/products?category=seasonal">Shop Seasonal <ArrowRight className="ml-1 h-3 w-3"/></Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Brands Section */}
        {brands && brands.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-end mb-8 border-b border-zinc-200 pb-4">
              <h2 className="text-2xl font-bold text-zinc-900">
                300+ Brands in Stock!
              </h2>
              <Link href="/brands" className="text-primary hover:underline font-medium flex items-center">
                shop all <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {brands.slice(0, 10).map((brand) => (
                <Link key={brand.id} href={`/products?brand=${brand.slug}`} className="flex items-center justify-center p-4 bg-white border border-zinc-100 rounded-lg hover:shadow-md transition-shadow grayscale hover:grayscale-0">
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={120}
                      height={60}
                      className="object-contain max-h-16"
                    />
                  ) : (
                    <span className="font-bold text-zinc-500 text-center">{brand.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Personalized Pet Recommendations */}
        <PetRecommendations />

        {/* Featured Products */}
        <FeaturedProducts products={featuredProducts} />

        {/* Services Callout */}
        <section className="mt-16 rounded-xl bg-zinc-900 p-10 text-center text-white bg-[url('/images/services-bg.jpg')] bg-cover bg-center relative overflow-hidden">
          <div className="absolute inset-0 bg-zinc-900/80"></div>
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="mb-4 text-3xl font-bold">Local Services</h2>
            <p className="mx-auto mb-8 max-w-xl text-zinc-200 text-lg">
              Propane refills, equipment rentals, and more. Stop by or reserve online.
            </p>
            <Button
              size="lg"
              className="bg-accent text-secondary hover:bg-accent/90 font-bold"
              asChild
            >
              <Link href="/services">View All Services</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
