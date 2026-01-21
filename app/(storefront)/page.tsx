import { ArrowRight, Leaf, Dog, Flame } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { PetRecommendations } from '@/components/storefront/pet-recommendations';
import { HeroCarousel } from '@/components/storefront/hero-carousel';
import { getFeaturedProducts } from '@/lib/data';
import { getHomepageSettings } from '@/lib/settings';

/**
 * Homepage - Main landing page for Bay State Pet & Garden Supply.
 * Features a bento-grid layout with category highlights and value proposition.
 */
export default async function HomePage() {
  const [featuredProducts, homepageSettings] = await Promise.all([
    getFeaturedProducts(6),
    getHomepageSettings(),
  ]);

  const { heroSlides, heroSlideInterval } = homepageSettings;

  return (
    <div className="w-full max-w-none px-4 py-8">
      {/* Promotional Hero Carousel */}
      {heroSlides && heroSlides.length > 0 && (
        <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
      )}

      {/* Hero Section (fallback when no carousel) */}
      {(!heroSlides || heroSlides.length === 0) && (
        <section className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            Bay State Pet & Garden
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-700">
            Your local source for pet supplies, garden tools, and farm products.
            Quality brands, expert advice, and neighborly service since 1985.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-12 px-8" asChild>
              <Link href="/products" className="hover:underline underline-offset-4">
                Shop Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8" asChild>
              <Link href="/services" className="hover:underline underline-offset-4">Our Services</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Bento Grid Categories */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-900">
          Shop by Category
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="group cursor-pointer transition-shadow hover:shadow-lg lg:col-span-1 lg:row-span-2">
            <CardContent className="flex h-full min-h-[280px] flex-col items-center justify-between p-6">
              <div className="mb-4 rounded-full bg-amber-100 p-4 flex items-center justify-center w-16 h-16 flex-none">
                <Dog className="h-10 w-10 text-amber-700" />
              </div>
              <div className="text-center">
                <h3 className="mb-2 text-xl font-semibold text-zinc-900">
                  Pet Supplies
                </h3>
                <p className="mb-4 text-sm text-zinc-700">
                  Dog, Cat, Small Pet, Bird, Reptile & Fish
                </p>
              </div>
              <Button variant="ghost" className="group-hover:bg-zinc-100" asChild>
                <Link href="/products?category=pet-supplies" className="hover:underline underline-offset-4">
                  Browse Pets
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-shadow hover:shadow-lg">
            <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-between p-6">
              <div className="mb-3 rounded-full bg-red-100 p-3 flex items-center justify-center w-12 h-12 flex-none">
                <Leaf className="h-8 w-8 text-red-700" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-zinc-900">
                Farm & Livestock
              </h3>
              <p className="text-center text-sm text-zinc-700">
                Horse, Poultry, Feed & Supplies
              </p>
              <Button variant="ghost" className="group-hover:bg-zinc-100" asChild>
                <Link href="/products?category=farm" className="hover:underline underline-offset-4">
                  Browse Farm
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-shadow hover:shadow-lg">
            <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-between p-6">
              <div className="mb-3 rounded-full bg-green-100 p-3 flex items-center justify-center w-12 h-12 flex-none">
                <Leaf className="h-8 w-8 text-green-700" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-zinc-900">
                Lawn & Garden
              </h3>
              <p className="text-center text-sm text-zinc-700">
                Plants, Tools, Mulch & Pest Control
              </p>
              <Button variant="ghost" className="group-hover:bg-zinc-100" asChild>
                <Link href="/products?category=lawn-garden" className="hover:underline underline-offset-4">
                  Browse Garden
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-shadow hover:shadow-lg">
            <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-between p-6">
              <div className="mb-3 rounded-full bg-blue-100 p-3 flex items-center justify-center w-12 h-12 flex-none">
                <Flame className="h-8 w-8 text-blue-700" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-zinc-900">
                Home & Fuel
              </h3>
              <p className="text-center text-sm text-zinc-700">
                Wood Pellets, Coal, Propane & Heating
              </p>
              <Button variant="ghost" className="group-hover:bg-zinc-100" asChild>
                <Link href="/products?category=home" className="hover:underline underline-offset-4">
                  Browse Home
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group cursor-pointer transition-shadow hover:shadow-lg">
            <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-between p-6">
              <div className="mb-3 rounded-full bg-orange-100 p-3 flex items-center justify-center w-12 h-12 flex-none">
                <Leaf className="h-8 w-8 text-orange-700" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-zinc-900">
                Seasonal
              </h3>
              <p className="text-center text-sm text-zinc-700">
                Holiday Shoppe & Seasonal Products
              </p>
              <Button variant="ghost" className="group-hover:bg-zinc-100" asChild>
                <Link href="/products?category=seasonal" className="hover:underline underline-offset-4">
                  Browse Seasonal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Personalized Pet Recommendations (for logged-in users with pets) */}
      <PetRecommendations />

      {/* Featured Products */}
      <FeaturedProducts products={featuredProducts} />

      {/* Services Callout */}
      <section className="rounded-xl bg-zinc-900 p-8 text-center text-white">
        <h2 className="mb-4 text-2xl font-semibold">Local Services</h2>
        <p className="mx-auto mb-6 max-w-xl text-zinc-100">
          Propane refills, equipment rentals, and more.
          Stop by or reserve online.
        </p>
        <Button
          size="lg"
          variant="secondary"
          className="h-12 px-8"
          asChild
        >
          <Link href="/services" className="hover:underline underline-offset-4">View All Services</Link>
        </Button>
      </section>
    </div>
  );
}
