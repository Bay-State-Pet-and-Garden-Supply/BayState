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
import { getCategoryUrl, getBrandUrl } from '@/lib/urls';

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
        <section className="mb-12 bg-primary text-white py-16 text-center shadow-md">
          <div className="container mx-auto px-4">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl drop-shadow-md text-accent font-display">
              Baby Chicks Are Here!
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-xl font-medium tracking-wider">
              Pick up in store today, or pre-order!
            </p>
            <Button size="lg" className="bg-accent text-secondary hover:bg-accent/90 text-lg font-bold px-8 py-6 rounded-none shadow-lg border-b-2 border-black/20" asChild>
              <Link href={getCategoryUrl('farm-animal')}>
                Shop Now
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4">
        <section className="my-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Link href={getCategoryUrl('lawn-garden-seasonal-outdoor-utility')} className="group border border-zinc-200 rounded-lg overflow-hidden relative aspect-[627/376] transition-all hover:-translate-y-1 hover:shadow-md shadow-sm bg-zinc-100">
            <Image src="/images/legacy/img1.png" alt="Winter Essentials" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <h3 className="text-white text-xl sm:text-2xl font-semibold leading-none font-display">Winter Essentials</h3>
            </div>
          </Link>

          <div className="flex flex-col gap-6">
            <Link href={getCategoryUrl('farm-animal')} className="group border border-zinc-200 rounded-lg overflow-hidden relative aspect-[627/174] transition-all hover:-translate-y-1 hover:shadow-md shadow-sm bg-zinc-100">
               <Image src="/images/legacy/img2.png" alt="Bee Nuc Pre-Order" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
               <div className="absolute top-2 right-2 bg-card p-3 shadow-md rounded-bl-lg">
                 <h3 className="text-foreground text-sm sm:text-base font-bold leading-none font-display">Bee Nuc Pre-Order</h3>
               </div>
            </Link>

            <Link href={getCategoryUrl('home')} className="group border border-zinc-200 rounded-lg overflow-hidden relative aspect-[627/174] transition-all hover:-translate-y-1 hover:shadow-md shadow-sm bg-zinc-100">
              <Image src="/images/legacy/img3.png" alt="Wood Pellets Sale" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
              <div className="absolute top-2 right-2 bg-card p-3 shadow-md rounded-bl-lg">
                <h3 className="text-foreground text-sm sm:text-base font-bold leading-none font-display">Wood Pellets Sale</h3>
              </div>
            </Link>
          </div>
        </section>

        <section className="mb-12 border border-zinc-200 rounded-lg relative overflow-hidden shadow-sm aspect-[1280/230] bg-zinc-100 transition-all hover:-translate-y-1 hover:shadow-md block">
          <Link href={getCategoryUrl('home')} className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 group">
            <Image src="/images/legacy/img4.png" alt="Country Gift Shop" fill className="object-cover -z-10" />
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-white drop-shadow-sm font-display group-hover:scale-105 transition-transform">
              Country Gift Shop
            </h2>
          </Link>
        </section>

        <section className="mb-16">
          <div className="flex justify-between items-end mb-8 border-b-2 border-primary/20 pb-4">
            <h2 className="text-4xl sm:text-6xl font-bold text-zinc-900 tracking-tighter font-display">
              Shop by Department
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Link href={getCategoryUrl('dog')} className="group border border-primary/20 rounded-xl bg-gradient-to-b from-white to-primary/5 h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col items-center justify-center text-center p-6 hover:border-primary">
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-4xl font-semibold leading-tight tracking-tight text-foreground font-display mb-4 group-hover:text-primary transition-colors">
                  Pet<br/>Supplies
                </h3>
                <div className="h-1 w-12 bg-secondary mt-4 transition-all group-hover:w-24 group-hover:bg-secondary"></div>
                <span className="mt-8 text-primary font-semibold uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">Explore Department &rarr;</span>
              </div>
            </Link>

            <Link href={getCategoryUrl('farm-animal')} className="group border border-primary/20 rounded-xl bg-gradient-to-b from-white to-primary/5 h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col items-center justify-center text-center p-6 hover:border-primary">
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-4xl font-semibold leading-tight tracking-tight text-foreground font-display mb-4 group-hover:text-primary transition-colors">
                  Farm &<br/>Livestock
                </h3>
                <div className="h-1 w-12 bg-secondary mt-4 transition-all group-hover:w-24 group-hover:bg-secondary"></div>
                <span className="mt-8 text-primary font-semibold uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">Explore Department &rarr;</span>
              </div>
            </Link>

            <Link href={getCategoryUrl('lawn-garden')} className="group border border-primary/20 rounded-xl bg-gradient-to-b from-white to-primary/5 h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col items-center justify-center text-center p-6 hover:border-primary">
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-4xl font-semibold leading-tight tracking-tight text-foreground font-display mb-4 group-hover:text-primary transition-colors">
                  Lawn &<br/>Garden
                </h3>
                <div className="h-1 w-12 bg-secondary mt-4 transition-all group-hover:w-24 group-hover:bg-secondary"></div>
                <span className="mt-8 text-primary font-semibold uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">Explore Department &rarr;</span>
              </div>
            </Link>

            <Link href={getCategoryUrl('home')} className="group border border-primary/20 rounded-xl bg-gradient-to-b from-white to-primary/5 h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col items-center justify-center text-center p-6 hover:border-primary">
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-4xl font-semibold leading-tight tracking-tight text-foreground font-display mb-4 group-hover:text-primary transition-colors">
                  Home &<br/>Fuel
                </h3>
                <div className="h-1 w-12 bg-secondary mt-4 transition-all group-hover:w-24 group-hover:bg-secondary"></div>
                <span className="mt-8 text-primary font-semibold uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">Explore Department &rarr;</span>
              </div>
            </Link>

            <Link href={getCategoryUrl('lawn-garden-seasonal-outdoor-utility')} className="group border border-primary/20 rounded-xl bg-gradient-to-b from-white to-primary/5 h-[300px] transition-all hover:-translate-y-1 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col items-center justify-center text-center p-6 hover:border-primary">
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-4xl font-semibold leading-tight tracking-tight text-foreground font-display mb-4 group-hover:text-primary transition-colors">
                  Seasonal<br/>Shoppe
                </h3>
                <div className="h-1 w-12 bg-secondary mt-4 transition-all group-hover:w-24 group-hover:bg-secondary"></div>
                <span className="mt-8 text-primary font-semibold uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">Explore Department &rarr;</span>
              </div>
            </Link>
          </div>
        </section>

        {brands && brands.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-end mb-8 border-b-2 border-primary/20 pb-4">
              <h2 className="text-3xl font-bold text-zinc-900 tracking-tighter font-display">
                300+ Brands in Stock!
              </h2>
              <Link href="/brands" className="text-primary hover:underline font-semibold text-sm flex items-center">
                shop all <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.slice(0, 10).map((brand) => (
                <Link
                  key={brand.id}
                  href={getBrandUrl(brand.slug)}
                  className="flex items-center justify-center p-4 bg-white border border-zinc-200 hover:border-primary transition-colors grayscale hover:grayscale-0"
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
                    <span className="font-bold text-zinc-500 text-center uppercase tracking-tight text-xs font-display">
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


      </div>
    </div>
  );
}
