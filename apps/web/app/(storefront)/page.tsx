import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { PetRecommendations } from '@/components/storefront/pet-recommendations';
import { HeroCarousel } from '@/components/storefront/hero-carousel';
import { getFeaturedProducts, getBrands } from '@/lib/data';
import { getHomepageSettings } from '@/lib/settings';

const stackedPromotions = [
  {
    href: '/products?category=farm',
    imageSrc: '/images/legacy/img2.png',
    alt: 'Bee Nuc Pre-Order',
    title: 'Bee Nuc Pre-Order',
    description: 'Reserve your spring setup before the rush starts.',
  },
  {
    href: '/products?category=home',
    imageSrc: '/images/legacy/img3.png',
    alt: 'Wood Pellets Sale',
    title: 'Wood Pellets Sale',
    description: 'Steady fuel and household basics for colder days.',
  },
] as const;

const departmentCards = [
  {
    href: '/products?category=pet-supplies',
    title: 'Pet Supplies',
    description: 'Feed, treats, and practical everyday care from brands customers actually ask for by name.',
    tone: 'from-[#55735f] to-[#385142]',
  },
  {
    href: '/products?category=farm',
    title: 'Farm & Livestock',
    description: 'Chick starter, bedding, and durable barn staples for chores that need to get done right the first time.',
    tone: 'from-[#8b5a45] to-[#6c4332]',
  },
  {
    href: '/products?category=lawn-garden',
    title: 'Lawn & Garden',
    description: 'Soil, seed, tools, and seasonal help for the kind of yard work that still feels hands-on.',
    tone: 'from-[#648a57] to-[#43623c]',
  },
  {
    href: '/products?category=home',
    title: 'Home & Fuel',
    description: 'Pellets, heating basics, and useful household goods for practical New England routines.',
    tone: 'from-[#58718d] to-[#3f5369]',
  },
  {
    href: '/products?category=seasonal',
    title: 'Seasonal Shoppe',
    description: 'Rotating local favorites, holiday extras, and the seasonal finds that make a visit feel worth it.',
    tone: 'from-[#b06c3f] to-[#8f522f]',
  },
  {
    href: '/products?category=gift-shop',
    title: 'Gift Shop',
    description: 'Country gifts, porch-worthy decor, and the small things customers like to discover on the way to checkout.',
    tone: 'from-[#816247] to-[#5e4834]',
  },
] as const;

export default async function HomePage() {
  const [featuredProducts, homepageSettings, brands] = await Promise.all([
    getFeaturedProducts(6),
    getHomepageSettings(),
    getBrands(),
  ]);

  const { heroSlides, heroSlideInterval } = homepageSettings;

  return (
    <div className="w-full max-w-none pb-12 pt-0">
      {heroSlides && heroSlides.length > 0 && (
        <div className="px-4 pt-4">
          <HeroCarousel slides={heroSlides} interval={heroSlideInterval} />
        </div>
      )}

      {(!heroSlides || heroSlides.length === 0) && (
        <section className="px-4 pt-4">
          <div className="container mx-auto">
            <div className="storefront-panel overflow-hidden bg-[linear-gradient(135deg,#47654b_0%,#344c38_100%)] px-8 py-14 text-white sm:px-12 sm:py-18">
              <p className="mb-3 text-sm font-medium tracking-[0.14em] text-white/70">
                Fresh from the co-op counter
              </p>
              <h1 className="mb-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Baby Chicks Are Here!
              </h1>
              <p className="mb-8 max-w-2xl text-lg font-medium text-white/80">
                Browse online, then stop in for the kind of practical advice and pickup experience a local store should offer.
              </p>
              <Button
                size="lg"
                className="bg-accent px-8 py-6 text-lg font-semibold text-secondary shadow-sm hover:bg-accent/90"
                asChild
              >
                <Link href="/products?category=farm">Shop Now</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="container mx-auto space-y-16 px-4">
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Link
            href="/products?category=seasonal"
            className="storefront-panel group relative aspect-[627/376] overflow-hidden"
          >
            <Image
              src="/images/legacy/img1.png"
              alt="Winter Essentials"
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="mb-2 text-sm font-medium tracking-[0.14em] text-white/75">
                Locally stocked staples
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Winter essentials
              </h2>
              <p className="mt-3 max-w-md text-sm font-medium text-white/80">
                Feed, bedding, and practical cold-weather supplies that are ready when the forecast turns.
              </p>
            </div>
          </Link>

          <div className="grid gap-6">
            {stackedPromotions.map((promotion) => (
              <Link
                key={promotion.title}
                href={promotion.href}
                className="storefront-panel group relative aspect-[627/174] overflow-hidden"
              >
                <Image
                  src={promotion.imageSrc}
                  alt={promotion.alt}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/15" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 text-white">
                  <h3 className="font-display text-2xl font-bold tracking-tight">
                    {promotion.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm font-medium text-white/80">
                    {promotion.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="storefront-panel group relative block aspect-[1280/230] overflow-hidden">
          <Link
            href="/products?category=gift-shop"
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/25"
          >
            <Image
              src="/images/legacy/img4.png"
              alt="Country Gift Shop"
              fill
              className="-z-10 object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="rounded-[1.5rem] border border-white/20 bg-black/35 px-8 py-5 text-center text-white backdrop-blur-sm">
              <p className="mb-2 text-sm font-medium tracking-[0.14em] text-white/75">
                A front-porch favorite
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
                Country gift shop
              </h2>
            </div>
          </Link>
        </section>

        <section className="space-y-8">
          <div className="border-b border-[var(--surface-storefront-border)] pb-4">
            <p className="storefront-kicker mb-2">Browse in person or online</p>
            <h2 className="font-display text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
              Shop by department
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {departmentCards.map((department) => (
              <Link
                key={department.title}
                href={department.href}
                className={`storefront-panel group relative min-h-[300px] overflow-hidden bg-gradient-to-br ${department.tone}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_40%)]" />
                <div className="relative flex h-full flex-col justify-between p-7 text-white">
                  <div>
                    <p className="text-sm font-medium tracking-[0.14em] text-white/70">
                      Department
                    </p>
                    <h3 className="mt-3 font-display text-4xl font-bold tracking-tight">
                      {department.title}
                    </h3>
                    <p className="mt-4 max-w-xs text-sm font-medium leading-6 text-white/82">
                      {department.description}
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                    Explore department
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {brands && brands.length > 0 && (
          <section className="space-y-8">
            <div className="flex items-end justify-between border-b border-[var(--surface-storefront-border)] pb-4">
              <div>
                <p className="storefront-kicker mb-2">Trusted makers</p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900">
                  300+ brands in stock
                </h2>
              </div>
              <Link href="/brands" className="flex items-center text-sm font-medium text-primary hover:underline">
                Shop all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.slice(0, 10).map((brand) => (
                <Link
                  key={brand.id}
                  href={`/products?brand=${brand.slug}`}
                  className="storefront-panel flex items-center justify-center p-4 grayscale transition-all hover:border-[var(--surface-storefront-accent)] hover:grayscale-0"
                >
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={120}
                      height={60}
                      className="max-h-16 object-contain"
                    />
                  ) : (
                    <span className="text-center font-display text-xs font-bold tracking-tight text-zinc-500">
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

        <section className="storefront-panel relative overflow-hidden bg-[url('/images/services-bg.jpg')] bg-cover bg-center text-white">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(17,24,39,0.72),rgba(39,45,34,0.62))]" />
          <div className="relative z-10 flex flex-col items-center px-8 py-14 text-center sm:px-12">
            <p className="mb-3 text-sm font-medium tracking-[0.14em] text-white/70">
              Helpful around the yard and barn
            </p>
            <h2 className="mb-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Local services
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg font-medium text-zinc-200">
              Propane refills, equipment rentals, and practical services that make a neighborhood supply store worth the trip.
            </p>
            <Button
              size="lg"
              className="h-16 rounded-full bg-accent px-12 text-xl font-semibold text-secondary shadow-sm hover:bg-accent/90"
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
