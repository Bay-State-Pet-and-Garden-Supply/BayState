import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { PetRecommendations } from '@/components/storefront/pet-recommendations';
import { HeroCarousel } from '@/components/storefront/hero-carousel';
import { UnderConstructionBanner } from '@/components/storefront/under-construction-banner';
import { getFeaturedProducts, getBrands } from '@/lib/data';
import { getHomepageSettings } from '@/lib/settings';

export default async function HomePage() {
  const [featuredProducts, homepageSettings, brands] = await Promise.all([
    getFeaturedProducts(6),
    getHomepageSettings(),
    getBrands(),
  ]);

  const { heroSlides, heroSlideInterval } = homepageSettings;

  return (
    <div className="w-full max-w-none pt-0 pb-8">
      <UnderConstructionBanner />
      {heroSlides && heroSlides.length > 0 && (
        <div className="px-4 pt-4">
          <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
        </div>
      )}

      {(!heroSlides || heroSlides.length === 0) && (
        <section className="mb-12 bg-primary text-primary-foreground py-16 text-center shadow-md">
          <div className="container mx-auto px-4">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl font-display">
              Baby Chicks Are Here!
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-xl font-medium tracking-wide">
              Pick up in store today, or pre-order!
            </p>
            <Button size="lg" className="bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)] text-lg font-semibold px-8 py-6 shadow-sm tracking-wide" asChild>
              <Link href="/products?category=farm">
                Shop Now
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4">
        <section className="my-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Link href="/products?category=seasonal" className="group border border-[oklch(85%_0.03_160)] overflow-hidden relative aspect-[627/376] transition-all hover:-translate-y-1 hover:shadow-lg shadow-md bg-muted">
            <Image src="/images/legacy/img1.png" alt="Winter Essentials" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
            <div className="absolute bottom-0 left-0 right-0 bg-[oklch(20%_0.02_90)]/80 p-4">
              <h3 className="text-primary-foreground text-xl sm:text-2xl font-bold tracking-tight leading-none font-display">Winter Essentials</h3>
            </div>
          </Link>

          <div className="flex flex-col gap-6">
            <Link href="/products?category=farm" className="group border border-[oklch(85%_0.03_160)] overflow-hidden relative aspect-[627/174] transition-all hover:-translate-y-1 hover:shadow-lg shadow-md bg-muted">
               <Image src="/images/legacy/img2.png" alt="Bee Nuc Pre-Order" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
               <div className="absolute top-2 right-2 bg-[oklch(25%_0.02_90)] p-2">
                 <h3 className="text-primary-foreground text-xs sm:text-sm font-bold tracking-tight leading-none font-display">Bee Nuc Pre-Order</h3>
               </div>
            </Link>

            <Link href="/products?category=home" className="group border border-[oklch(85%_0.03_160)] overflow-hidden relative aspect-[627/174] transition-all hover:-translate-y-1 hover:shadow-lg shadow-md bg-muted">
              <Image src="/images/legacy/img3.png" alt="Wood Pellets Sale" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
              <div className="absolute top-2 right-2 bg-[oklch(45%_0.12_25)] p-2">
                <h3 className="text-primary-foreground text-xs sm:text-sm font-bold tracking-tight leading-none font-display">Wood Pellets Sale</h3>
              </div>
            </Link>
          </div>
        </section>

        <section className="mb-12 border border-[oklch(85%_0.03_160)] relative overflow-hidden shadow-md aspect-[1280/230] bg-muted transition-all hover:-translate-y-1 hover:shadow-lg block">
          <Link href="/products?category=gift-shop" className="absolute inset-0 z-10 flex items-center justify-center bg-[oklch(20%_0.02_90)]/30 group">
            <Image src="/images/legacy/img4.png" alt="Country Gift Shop" fill className="object-cover -z-10" />
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-primary-foreground font-display group-hover:scale-105 transition-transform">
              Country Gift Shop
            </h2>
          </Link>
        </section>

        <section className="mb-16">
          <div className="flex justify-between items-end mb-8 border-b border-[oklch(85%_0.03_160)] pb-3">
            <h2 className="text-4xl sm:text-6xl font-bold text-foreground tracking-tight font-display">
              Shop by Department
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/products?category=pet-supplies" className="group border border-[oklch(85%_0.03_160)] bg-primary h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-bold tracking-tight leading-tight text-primary-foreground font-display mb-4">
                  Pet<br/>Supplies
                </h3>
                <div className="h-1 w-20 bg-primary-foreground/70 mt-3"></div>
                <span className="mt-8 text-primary-foreground/80 font-medium tracking-wide text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=farm" className="group border border-[oklch(85%_0.03_160)] bg-primary h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-bold tracking-tight leading-tight text-primary-foreground font-display mb-4">
                  Farm &<br/>Livestock
                </h3>
                <div className="h-1 w-20 bg-primary-foreground/70 mt-3"></div>
                <span className="mt-8 text-primary-foreground/80 font-medium tracking-wide text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=lawn-garden" className="group border border-[oklch(85%_0.03_160)] bg-primary h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-bold tracking-tight leading-tight text-primary-foreground font-display mb-4">
                  Lawn &<br/>Garden
                </h3>
                <div className="h-1 w-20 bg-primary-foreground/70 mt-3"></div>
                <span className="mt-8 text-primary-foreground/80 font-medium tracking-wide text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=home" className="group border border-[oklch(85%_0.03_160)] bg-primary h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-bold tracking-tight leading-tight text-primary-foreground font-display mb-4">
                  Home &<br/>Fuel
                </h3>
                <div className="h-1 w-20 bg-primary-foreground/70 mt-3"></div>
                <span className="mt-8 text-primary-foreground/80 font-medium tracking-wide text-xs">Explore Department →</span>
              </div>
            </Link>

            <Link href="/products?category=seasonal" className="group border border-[oklch(85%_0.03_160)] bg-primary h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-primary group-hover:bg-primary/95 transition-colors">
                <h3 className="text-5xl font-bold tracking-tight leading-tight text-primary-foreground font-display mb-4">
                  Seasonal<br/>Shoppe
                </h3>
                <div className="h-1 w-20 bg-primary-foreground/70 mt-3"></div>
                <span className="mt-8 text-primary-foreground/80 font-medium tracking-wide text-xs">Explore Department →</span>
              </div>
            </Link>
          </div>
        </section>

        {brands && brands.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-end mb-8 border-b border-[oklch(85%_0.03_160)] pb-3">
              <h2 className="text-3xl font-bold text-foreground tracking-tight font-display">
                300+ Brands in Stock!
              </h2>
              <Link href="/brands" className="text-primary hover:underline font-medium text-sm flex items-center">
                shop all <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.slice(0, 10).map((brand) => (
                <Link
                  key={brand.id}
                  href={`/products?brand=${brand.slug}`}
                  className="flex items-center justify-center p-4 bg-card border border-[oklch(85%_0.03_160)] hover:border-[oklch(70%_0.04_160)] transition-colors opacity-80 hover:opacity-100"
                >
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={120}
                      height={60}
                      className="object-contain max-h-16"
                      unoptimized
                    />
                  ) : (
                    <span className="font-medium text-muted-foreground text-center tracking-tight text-xs">
                      {brand.name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        <PetRecommendations />
        <FeaturedProducts products={featuredProducts} />

        <section className="mt-16 border border-[oklch(85%_0.03_160)] bg-[oklch(25%_0.02_90)] p-12 text-center text-primary-foreground bg-[url('/images/services-bg.jpg')] bg-cover bg-center relative overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_90)]/80"></div>
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="mb-4 text-5xl font-bold tracking-tight font-display">Local Services</h2>
            <p className="mx-auto mb-10 max-w-xl text-primary-foreground/80 text-lg font-medium tracking-wide">
              Propane refills, equipment rentals, and more. Stop by or reserve online.
            </p>
            <Button
              size="lg"
              className="h-16 px-12 text-xl font-semibold bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)] shadow-sm tracking-wide"
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
