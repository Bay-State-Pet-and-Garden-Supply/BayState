import { StorefrontHeader } from '@/components/storefront/header';
import { StorefrontFooter } from '@/components/storefront/footer';
import { MobileNav } from '@/components/storefront/mobile-nav';
import { CampaignBanner } from '@/components/storefront/campaign-banner';
import { SearchProvider } from '@/components/storefront/search-provider';
import { StickyCart } from '@/components/storefront/sticky-cart';
import { getProducts, getActiveServices, getBrands, getNavCategories, getPetTypesNav } from '@/lib/data';
import { getCampaignBanner } from '@/lib/settings';

import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { SkipLink } from '@/components/ui/skip-link';

/**
 * StorefrontLayout - Layout wrapper for all customer-facing pages.
 * Includes header, footer, and mobile bottom navigation.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Fetch search data, campaign settings, and user session
  const [{ data: { user } }, { products }, services, brands, categories, petTypes, campaignBanner] = await Promise.all([
    supabase.auth.getUser(),
    getProducts({ limit: 100 }),
    getActiveServices(),
    getBrands(),
    getNavCategories(),
    getPetTypesNav(),
    getCampaignBanner(),
  ]);

  const userRole = user ? await getUserRole(user.id) : null;

  // JSON-LD structured data for local business
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Bay State Pet & Garden Supply',
    description: 'Your local source for pet supplies, garden tools, and farm products. Quality brands, expert advice, and neighborly service since 1997.',
    url: 'https://baystatepetgarden.com',
    telephone: '+1-508-821-3704',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '429 Winthrop Street',
      addressLocality: 'Taunton',
      addressRegion: 'MA',
      postalCode: '02780',
      addressCountry: 'US',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '19:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Sunday',
        opens: '08:00',
        closes: '17:00',
      },
    ],
  };

  return (
    <SearchProvider initialData={{ products, services, brands }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col w-full">
        <SkipLink />
        {campaignBanner.enabled && campaignBanner.messages.length > 0 && (
          <CampaignBanner
            messages={campaignBanner.messages}
            variant={campaignBanner.variant}
            cycleInterval={campaignBanner.cycleInterval}
          />
        )}
        <StorefrontHeader 
          user={user} 
          userRole={userRole} 
          categories={categories}
          petTypes={petTypes}
          brands={brands}
        />
        <main id="main-content" className="flex-1 pb-20 md:pb-0">{children}</main>
        <StorefrontFooter />
        <StickyCart />
        <MobileNav />
      </div>
    </SearchProvider>
  );
}
