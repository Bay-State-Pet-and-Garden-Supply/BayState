import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
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
    <div className="w-full pb-8 pt-0">
      <UnderConstructionBanner />

      {heroSlides && heroSlides.length > 0 ? (
        <section className="px-4 pt-4">
          <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
        </section>
      ) : null}

      <div className="container mx-auto px-4">
        <section className="my-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Link
            href={getCategoryUrl('lawn-garden-seasonal-outdoor-utility')}
            className="group relative aspect-[627/376] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Image
              src="/images/legacy/img1.png"
              alt="Winter Essentials"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6">
              <h3 className="text-xl font-semibold text-white md:text-2xl">Winter Essentials</h3>
            </div>
          </Link>

          <div className="flex flex-col gap-6">
            <Link
              href={getCategoryUrl('farm-animal')}
              className="group relative aspect-[627/174] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image
                src="/images/legacy/img2.png"
                alt="Bee Nuc Pre-Order"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute right-3 top-3 rounded-xl bg-card px-4 py-2.5 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground md:text-base">
                  Bee Nuc Pre-Order
                </h3>
              </div>
            </Link>

            <Link
              href={getCategoryUrl('home')}
              className="group relative aspect-[627/174] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image
                src="/images/legacy/img3.png"
                alt="Wood Pellets Sale"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute right-3 top-3 rounded-xl bg-card px-4 py-2.5 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground md:text-base">
                  Wood Pellets Sale
                </h3>
              </div>
            </Link>
          </div>
        </section>

        <section className="mb-10">
          <Link
            href={getCategoryUrl('home')}
            className="group relative block aspect-[1280/230] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Image
              src="/images/legacy/img4.png"
              alt="Country Gift Shop"
              fill
              className="-z-10 object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
              <h2 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm transition-transform group-hover:scale-105 sm:text-5xl md:text-6xl">
                Country Gift Shop
              </h2>
            </div>
          </Link>
        </section>

        <section className="mb-14">
          <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Shop by department
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={getCategoryUrl('dog')}
              className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                Pet Supplies
              </h3>
              <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                Explore department &rarr;
              </span>
            </Link>

            <Link
              href={getCategoryUrl('farm-animal')}
              className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                Farm & Livestock
              </h3>
              <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                Explore department &rarr;
              </span>
            </Link>

            <Link
              href={getCategoryUrl('lawn-garden')}
              className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                Lawn & Garden
              </h3>
              <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                Explore department &rarr;
              </span>
            </Link>

            <Link
              href={getCategoryUrl('home')}
              className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                Home & Fuel
              </h3>
              <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                Explore department &rarr;
              </span>
            </Link>

            <Link
              href={getCategoryUrl('lawn-garden-seasonal-outdoor-utility')}
              className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                Seasonal Shoppe
              </h3>
              <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                Explore department &rarr;
              </span>
            </Link>
          </div>
        </section>

        {brands && brands.length > 0 ? (
          <section className="mb-14">
            <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Brands we carry
              </h2>
              <Link
                href="/brands"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Shop all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.slice(0, 10).map((brand) => (
                <Link
                  key={brand.id}
                  href={getBrandUrl(brand.slug)}
                  className="flex items-center justify-center rounded-xl border border-border bg-card p-5 shadow-sm transition-all grayscale hover:border-primary/20 hover:shadow-md hover:grayscale-0"
                >
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={120}
                      height={60}
                      className="max-h-14 object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="text-center text-sm font-semibold text-muted-foreground">
                      {brand.name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <PetRecommendations />
        <FeaturedProducts products={featuredProducts} />
      </div>
    </div>
  );
}
