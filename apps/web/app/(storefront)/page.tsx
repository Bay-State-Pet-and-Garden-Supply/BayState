import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { PetRecommendations } from '@/components/storefront/pet-recommendations';
import { HeroCarousel } from '@/components/storefront/hero-carousel';
import { UnderConstructionBanner } from '@/components/storefront/under-construction-banner';
import { getFeaturedProducts, getBrands, getProductsByIds } from '@/lib/data';
import { getHomepageSettings } from '@/lib/settings';
import { getCategoryUrl, getBrandUrl } from '@/lib/urls';

export default async function HomePage() {
  const homepageSettings = await getHomepageSettings();

  const [featuredProducts, brands] = await Promise.all([
    homepageSettings.featuredProductIds && homepageSettings.featuredProductIds.length > 0
      ? getProductsByIds(homepageSettings.featuredProductIds)
      : getFeaturedProducts(6),
    getBrands(),
  ]);

  const { heroSlides, heroSlideInterval } = homepageSettings;

  return (
    <div className="w-full pb-8 pt-0">
      <UnderConstructionBanner />

      {homepageSettings.heroMode !== 'hidden' && (
        <section className="px-4 pt-4">
          {homepageSettings.heroMode === 'single' ? (
            <div 
              className="relative w-full h-[360px] md:h-[480px] rounded-2xl overflow-hidden flex flex-col justify-center px-6 md:px-12 text-white bg-cover bg-center border border-border"
              style={{ 
                backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45)), url(${homepageSettings.hero.imageUrl || '/images/legacy/baby-chicks-are-here-s-ider.png'})` 
              }}
            >
              <div className="max-w-xl space-y-4">
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight font-display drop-shadow-xs">
                  {homepageSettings.hero.title}
                </h1>
                {homepageSettings.hero.subtitle && (
                  <p className="text-sm md:text-base text-zinc-100/95 drop-shadow-xs max-w-lg leading-relaxed">
                    {homepageSettings.hero.subtitle}
                  </p>
                )}
                {homepageSettings.hero.ctaText && homepageSettings.hero.ctaLink && (
                  <Link
                    href={homepageSettings.hero.ctaLink}
                    className="inline-flex items-center justify-center bg-brand-forest-green text-white hover:bg-brand-forest-green/90 font-semibold text-xs tracking-wider uppercase px-5 py-3 rounded-full transition-all shadow-sm"
                  >
                    {homepageSettings.hero.ctaText}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            heroSlides && heroSlides.length > 0 && (
              <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
            )
          )}
        </section>
      )}

      <div className="container mx-auto px-4">
        {homepageSettings.promoGrid && (
          <section className="my-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Link
              href={homepageSettings.promoGrid.leftBanner.linkUrl || getCategoryUrl('lawn-garden-seasonal-outdoor-utility')}
              className="group relative aspect-[627/376] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image
                src={homepageSettings.promoGrid.leftBanner.imageUrl || "/images/legacy/img1.png"}
                alt={homepageSettings.promoGrid.leftBanner.title || "Winter Essentials"}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                <h3 className="text-xl font-semibold text-white md:text-2xl">
                  {homepageSettings.promoGrid.leftBanner.title || "Winter Essentials"}
                </h3>
              </div>
            </Link>

            <div className="flex flex-col gap-6">
              <Link
                href={homepageSettings.promoGrid.rightCard1.linkUrl || getCategoryUrl('farm-animal')}
                className="group relative aspect-[627/174] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <Image
                  src={homepageSettings.promoGrid.rightCard1.imageUrl || "/images/legacy/img2.png"}
                  alt={homepageSettings.promoGrid.rightCard1.title || "Bee Nuc Pre-Order"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div className="absolute right-3 top-3 rounded-xl bg-card px-4 py-2.5 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground md:text-base">
                    {homepageSettings.promoGrid.rightCard1.title || "Bee Nuc Pre-Order"}
                  </h3>
                </div>
              </Link>

              <Link
                href={homepageSettings.promoGrid.rightCard2.linkUrl || getCategoryUrl('home')}
                className="group relative aspect-[627/174] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <Image
                  src={homepageSettings.promoGrid.rightCard2.imageUrl || "/images/legacy/img3.png"}
                  alt={homepageSettings.promoGrid.rightCard2.title || "Wood Pellets Sale"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div className="absolute right-3 top-3 rounded-xl bg-card px-4 py-2.5 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground md:text-base">
                    {homepageSettings.promoGrid.rightCard2.title || "Wood Pellets Sale"}
                  </h3>
                </div>
              </Link>
            </div>
          </section>
        )}

        {homepageSettings.midBanner?.enabled && (
          <section className="mb-10">
            <Link
              href={homepageSettings.midBanner.linkUrl || getCategoryUrl('home')}
              className="group relative block aspect-[1280/230] overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Image
                src={homepageSettings.midBanner.imageUrl || "/images/legacy/img4.png"}
                alt={homepageSettings.midBanner.title || "Country Gift Shop"}
                fill
                className="-z-10 object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
                <h2 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm transition-transform group-hover:scale-105 sm:text-5xl md:text-6xl">
                  {homepageSettings.midBanner.title || "Country Gift Shop"}
                </h2>
              </div>
            </Link>
          </section>
        )}

        {homepageSettings.departments?.enabled && (
          <section className="mb-14">
            <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {homepageSettings.departments.title || "Shop by department"}
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(homepageSettings.departments.items || []).map((item) => (
                <Link
                  key={item.id || item.slug}
                  href={getCategoryUrl(item.slug)}
                  className="group flex h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-brand-forest-green/[0.04] p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
                >
                  <h3 className="mb-4 text-3xl font-semibold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {item.name}
                  </h3>
                  <span className="mt-6 text-sm font-medium text-muted-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    Explore department &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {homepageSettings.brandsSection?.enabled && brands && brands.length > 0 ? (
          <section className="mb-14">
            <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {homepageSettings.brandsSection.title || "Brands we carry"}
              </h2>
              <Link
                href="/brands"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Shop all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.slice(0, homepageSettings.brandsSection.limit || 10).map((brand) => (
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
        <FeaturedProducts products={featuredProducts} title={homepageSettings.featuredTitle} />
      </div>
    </div>
  );
}
