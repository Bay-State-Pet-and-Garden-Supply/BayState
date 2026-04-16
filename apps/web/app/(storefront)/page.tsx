import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
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
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl uppercase drop-shadow-md text-accent font-display">
              Baby Chicks Are Here!
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-xl font-medium uppercase tracking-wider">
              Pick up in store today, or pre-order!
            </p>
            <Button size="lg" className="bg-accent text-secondary hover:bg-accent/90 text-lg font-bold px-8 py-6 rounded-none shadow-lg border-b-2 border-black/20" asChild>
              <Link href="/products?category=farm">
                Shop Now
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4">
        {/* Promotional Banner Grid - Modern Farm Utilitarian Style */}
        <section className="my-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/products?category=lawn-garden" className="group border border-zinc-900 overflow-hidden relative h-[320px] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white">
            <div className="h-2/3 relative bg-green-600 flex items-center justify-center">
               <h3 className="text-white text-5xl font-black uppercase tracking-tighter leading-none font-display">Garden</h3>
            </div>
            <div className="h-1/3 bg-white flex flex-col items-center justify-center p-4 border-t border-zinc-900 group-hover:bg-zinc-50">
              <h3 className="text-zinc-900 text-2xl font-black uppercase tracking-tighter leading-none font-display">Seed Starting</h3>
              <span className="uppercase tracking-widest text-zinc-600 font-black text-sm mb-2">Supplies</span>
              <span className="bg-primary text-white font-black py-1.5 px-6 uppercase text-sm border-b border-black/20">SHOP NOW</span>
            </div>
          </Link>

          <Link href="/products?category=farm" className="group border border-zinc-900 overflow-hidden relative h-[320px] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[8px_8px_0px_rgba(255,183,0,1)] bg-accent">
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 border-8 border-white/20">
              <h3 className="text-5xl font-black mb-2 text-secondary uppercase leading-none font-display">Bee Nuc&apos;s</h3>
              <div className="bg-black text-accent font-black px-6 py-3 text-2xl shadow-lg uppercase">
                PRE-ORDER NOW
              </div>
              <p className="mt-4 text-secondary font-bold uppercase tracking-widest text-xs">Arriving Spring 2026</p>
            </div>
          </Link>

          <Link href="/products?category=home" className="group border border-zinc-900 overflow-hidden relative h-[320px] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[8px_8px_0px_rgba(220,38,38,1)] bg-white">
            <div className="h-2/3 relative bg-zinc-900 flex items-center justify-center">
              <h3 className="text-white text-5xl font-black uppercase tracking-tighter leading-none font-display">Heating</h3>
              <div className="absolute top-4 left-4 bg-blue-600 text-white font-black text-xs px-2 py-1 uppercase tracking-wider">
                In Stock Now
              </div>
            </div>
            <div className="h-1/3 bg-red-600 flex flex-col items-center justify-center p-4 border-t border-zinc-900 group-hover:bg-red-700">
              <h3 className="text-white text-xl font-black uppercase leading-none font-display">WOOD PELLETS</h3>
              <span className="text-accent font-black text-sm mb-2 uppercase tracking-widest">WE BRING THE HEAT!</span>
              <span className="bg-white text-red-600 font-black py-1 px-4 uppercase text-xs border-b border-black/10">Order for Pickup</span>
            </div>
          </Link>
        </section>

        {/* Gift Shop Banner - Robust Box Style */}
        <section className="mb-12 border-2 border-zinc-900 bg-secondary text-accent p-8 text-center relative overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,0.2)]">
          <div className="absolute top-0 left-0 w-full h-2 bg-accent opacity-20"></div>
          <div className="flex flex-col items-center justify-center relative z-10">
            <h2 className="text-4xl sm:text-6xl font-black tracking-tighter mb-1 font-display">BAY STATE</h2>
            <h3 className="text-xl sm:text-2xl font-bold mb-8 uppercase tracking-[0.2em] border-y border-accent/30 py-1 px-6">Country Gift Shop</h3>
            <div className="max-w-4xl bg-accent text-secondary p-4 sm:p-6 shadow-xl border-b-2 border-black/20">
               <p className="text-sm sm:text-lg font-black uppercase leading-relaxed flex flex-wrap justify-center gap-x-4 gap-y-2">
                <span>Unique Gifts</span>
                <span className="text-black/30">•</span>
                <span>Soy Candles</span>
                <span className="text-black/30">•</span>
                <span>Goat Milk Soap</span>
                <span className="text-black/30">•</span>
                <span>Farm Fresh Eggs</span>
                <span className="text-black/30">•</span>
                <span>Local Raw Honey</span>
                <span className="text-black/30">•</span>
                <span>Old Fashioned Candy</span>
              </p>
            </div>
          </div>
        </section>

        {/* Shop by Department - Bold Typography-Driven Grid */}
        <section className="mb-16">
          <div className="flex justify-between items-end mb-8 border-b-8 border-zinc-900 pb-2">
            <h2 className="text-4xl sm:text-6xl font-black text-zinc-900 uppercase tracking-tighter font-display">
              Shop by Department
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/products?category=pet-supplies" className="group border-2 border-zinc-900 bg-primary h-[300px] transition-all hover:-translate-x-1 hover:-translate-y-1 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter text-white font-display mb-4">
                  Pet<br/>Supplies
                </h3>
                <div className="h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"></div>
                <span className="mt-8 text-white/80 font-bold uppercase tracking-[0.2em] text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=farm" className="group border-2 border-zinc-900 bg-red-600 h-[300px] transition-all hover:-translate-x-1 hover:-translate-y-1 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-red-600 group-hover:bg-red-700 transition-colors">
                <h3 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter text-white font-display mb-4">
                  Farm &<br/>Livestock
                </h3>
                <div className="h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"></div>
                <span className="mt-8 text-white/80 font-bold uppercase tracking-[0.2em] text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=lawn-garden" className="group border-2 border-zinc-900 bg-green-600 h-[300px] transition-all hover:-translate-x-1 hover:-translate-y-1 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-green-600 group-hover:bg-green-700 transition-colors">
                <h3 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter text-white font-display mb-4">
                  Lawn &<br/>Garden
                </h3>
                <div className="h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"></div>
                <span className="mt-8 text-white/80 font-bold uppercase tracking-[0.2em] text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=home" className="group border-2 border-zinc-900 bg-blue-600 h-[300px] transition-all hover:-translate-x-1 hover:-translate-y-1 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-blue-600 group-hover:bg-blue-700 transition-colors">
                <h3 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter text-white font-display mb-4">
                  Home &<br/>Fuel
                </h3>
                <div className="h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"></div>
                <span className="mt-8 text-white/80 font-bold uppercase tracking-[0.2em] text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=seasonal" className="group border-2 border-zinc-900 bg-orange-600 h-[300px] transition-all hover:-translate-x-1 hover:-translate-y-1 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-orange-600 group-hover:bg-orange-700 transition-colors">
                <h3 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter text-white font-display mb-4">
                  Seasonal<br/>Shoppe
                </h3>
                <div className="h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"></div>
                <span className="mt-8 text-white/80 font-bold uppercase tracking-[0.2em] text-xs">Explore Department →</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Brands Section */}
        {brands && brands.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-end mb-8 border-b-2 border-zinc-900 pb-4">
              <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter font-display">
                300+ Brands in Stock!
              </h2>
              <Link href="/brands" className="text-primary hover:underline font-black uppercase text-sm flex items-center">
                shop all <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {brands.slice(0, 10).map((brand) => (
                <Link key={brand.id} href={`/products?brand=${brand.slug}`} className="flex items-center justify-center p-4 bg-white border border-zinc-200 hover:border-zinc-900 transition-colors grayscale hover:grayscale-0">
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={120}
                      height={60}
                      className="object-contain max-h-16"
                    />
                  ) : (
                    <span className="font-bold text-zinc-500 text-center uppercase tracking-tight text-xs font-display">{brand.name}</span>
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

        {/* Services Callout - Robust Block Style */}
        <section className="mt-16 border-2 border-zinc-900 bg-zinc-900 p-12 text-center text-white bg-[url('/images/services-bg.jpg')] bg-cover bg-center relative overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,0.2)]">
          <div className="absolute inset-0 bg-black/80"></div>
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="mb-4 text-5xl font-black uppercase tracking-tighter font-display">Local Services</h2>
            <p className="mx-auto mb-10 max-w-xl text-zinc-200 text-lg font-bold uppercase tracking-wide">
              Propane refills, equipment rentals, and more. Stop by or reserve online.
            </p>
            <Button
              size="lg"
              className="h-16 px-12 text-xl font-black uppercase rounded-none bg-accent text-secondary hover:bg-accent/90 border-b-2 border-black/20"
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
