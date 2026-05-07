"use client";

import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineSearch } from "@/components/storefront/inline-search";
import { useCartStore } from "@/lib/cart-store";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { MobileNavDrawer } from "@/components/storefront/mobile-nav-drawer";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

import { User } from "@supabase/supabase-js";
import { UserMenu } from "@/components/auth/user-menu";
import { createClient } from "@/lib/supabase/client";
import type { CampaignBannerSettings } from "@/lib/settings";
import { useUIStore } from "@/lib/storefront/ui-store";

type StorefrontCategory = {
  id: string;
  name: string;
  slug: string | null;
  parent_id?: string | null;
  is_featured?: boolean | null;
  description?: string | null;
};

const desktopNavigationTriggerClassName =
  "h-12 rounded-none bg-transparent px-4 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white data-[state=open]:bg-white data-[state=open]:text-zinc-950 data-[state=open]:hover:bg-white data-[state=open]:focus:bg-white";

const desktopMegaMenuContentClassName =
  "left-0 right-0 top-full z-[100] w-full overflow-hidden bg-white text-zinc-900 shadow-md md:w-full";

function normalizeStorefrontUserRole(user: User | null): string | null {
  const metadataRoles = [
    user?.app_metadata?.role,
    user?.user_metadata?.role,
  ];

  for (const role of metadataRoles) {
    if (role === "admin" || role === "staff" || role === "customer") {
      return role;
    }
  }

  return null;
}

function getCategoryHref(slug: string | null): string {
  return slug ? `/products?category=${slug}` : "/products";
}

function getCategorySummary(category: StorefrontCategory): string {
  if (category.description?.trim()) {
    return category.description.trim();
  }

  return `Explore popular departments and everyday essentials for ${category.name.toLowerCase()}.`;
}

export function StorefrontHeader({
  user,
  userRole,
  categories,
  petTypes,
  brands,
  campaignBanner,
}: {
  user?: User | null;
  userRole?: string | null;
  categories: StorefrontCategory[];
  petTypes: Array<{ id: string; name: string; icon: string | null }>;
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  }>;
  campaignBanner?: CampaignBannerSettings;
}) {
  const itemCount = useCartStore((state) => state.getItemCount());
  const { isCartDrawerOpen, openCartDrawer, closeCartDrawer } = useUIStore();

  const hasServerProvidedAuth = user !== undefined || userRole !== undefined;
  const [clientUser, setClientUser] = useState<User | null>(null);
  const [clientUserRole, setClientUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (hasServerProvidedAuth) {
      return;
    }

    const supabase = createClient();
    let isActive = true;

    async function syncUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!isActive) {
        return;
      }

      setClientUser(currentUser ?? null);
      setClientUserRole(normalizeStorefrontUserRole(currentUser ?? null));
    }

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setClientUser(nextUser);
      setClientUserRole(normalizeStorefrontUserRole(nextUser));
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [hasServerProvidedAuth]);

  const resolvedUser = hasServerProvidedAuth ? (user ?? null) : clientUser;
  const resolvedUserRole = hasServerProvidedAuth ? (userRole ?? null) : clientUserRole;

  // Group categories into a hierarchy for the Mega Menu
  const { topLevel, childrenMap } = useMemo(() => {
    const topLevel = categories.filter((c) => !c.parent_id);
    const childrenMap = new Map<string, StorefrontCategory[]>();

    for (const category of categories) {
      if (!category.parent_id) {
        continue;
      }

      const siblings = childrenMap.get(category.parent_id) ?? [];
      siblings.push(category);
      childrenMap.set(category.parent_id, siblings);
    }

    return { topLevel, childrenMap };
  }, [categories]);

  const primaryNavCategories = topLevel.filter((category) => category.is_featured);

  // --- More Menu Logic ---
  const allNavItems = useMemo(() => [
    ...primaryNavCategories.map(c => ({ ...c, type: 'category' as const })),
    { id: 'brands', name: 'Brands', type: 'brands' as const }
  ], [primaryNavCategories]);

  const [visibleCount, setVisibleCount] = useState(allNavItems.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemWidthsRef = useRef<number[]>([]);
  const moreButtonWidthRef = useRef(100); // Approximate width of "More" button

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Measure items from the hidden measurement container
    const items = containerRef.current.querySelectorAll('.nav-item-measure');
    const widths: number[] = [];
    items.forEach((item) => {
      widths.push((item as HTMLElement).offsetWidth);
    });
    if (widths.length > 0) {
      itemWidthsRef.current = widths;
    }
  }, [allNavItems]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      const utilityWidth = 100; // Space for spacer margin
      const availableWidth = width - utilityWidth;
      
      let currentWidth = 0;
      let count = 0;
      
      for (let i = 0; i < itemWidthsRef.current.length; i++) {
        const itemWidth = itemWidthsRef.current[i];
        const isLastItem = i === itemWidthsRef.current.length - 1;
        
        if (isLastItem) {
          if (currentWidth + itemWidth <= availableWidth) {
            count = i + 1;
          } else {
            count = i;
          }
        } else {
          // If we're not on the last item, we need to check if adding this item 
          // PLUS the "More" button would exceed available width.
          if (currentWidth + itemWidth + moreButtonWidthRef.current <= availableWidth) {
            currentWidth += itemWidth;
            count = i + 1;
          } else {
            count = i;
            break;
          }
        }
      }
      
      setVisibleCount(count);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [allNavItems]);

  const visibleItems = allNavItems.slice(0, visibleCount);
  const moreItems = allNavItems.slice(visibleCount);

  return (
    <>
      <header 
        className="max-md:hidden sticky top-0 z-50 w-full flex flex-col border-b-2 border-brand-burgundy shadow-md"
      >
        <div className="bg-primary text-white border-b-4 border-brand-burgundy shadow-sm">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            <Link 
              href="/" 
              className="flex items-center group shrink-0"
            >
              <div className="h-16 w-48 relative">
                <Image
                  src="/logo.png"
                  alt="Bay State Pet & Garden Supply Logo"
                  width={192}
                  height={64}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
            </Link>

            <div className="flex-1 max-w-xl mx-12">
              <InlineSearch />
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <UserMenu user={resolvedUser} userRole={resolvedUserRole} />
              <div className="h-12 w-px bg-white/20 mx-2" />
              <Button
                variant="ghost"
                size="icon"
                className="relative h-14 w-14 text-white hover:bg-zinc-900 rounded-none border-4 border-transparent hover:border-zinc-900 transition-all group"
                aria-label={`Shopping cart, ${itemCount} items`}
                onClick={openCartDrawer}
              >
                <ShoppingCart className="h-7 w-7 group-hover:scale-110 transition-transform" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center bg-accent text-[12px] font-bold text-accent-foreground border-4 border-brand-burgundy shadow-sm">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative border-t border-brand-burgundy/50 bg-brand-forest-dark text-white/90 transition-all duration-300 ease-in-out">
          <div className="container mx-auto flex h-12 items-center px-4 transition-all duration-300 ease-in-out" ref={containerRef}>
            <NavigationMenu className="flex w-full max-w-none" aria-label="Main Navigation" viewport={false}>
              
              {/* Hidden container for measurement */}
              <div className="absolute opacity-0 pointer-events-none flex whitespace-nowrap" aria-hidden="true">
                 {allNavItems.map(item => (
                   <div key={item.id} className="nav-item-measure flex h-12 items-center px-4 text-sm font-medium text-white/80">
                       {item.name}
                       <ChevronDownIcon className="ml-1 size-3" />
                    </div>
                 ))}
              </div>

               <NavigationMenuList className="w-full justify-start gap-0">
                {visibleItems.map((item) => {
                  if (item.type === 'category') {
                    const parent = item;
                    const sections = (childrenMap.get(parent.id) || []).map((section) => ({
                      section,
                      links: childrenMap.get(section.id) || [],
                    }));

                    if (sections.length === 0) return null;

                    return (
                      <NavigationMenuItem key={parent.id} className="static">
                        <NavigationMenuTrigger className={desktopNavigationTriggerClassName}>
                          {parent.name}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={desktopMegaMenuContentClassName}>
                          <div className="container mx-auto grid grid-cols-[220px_minmax(0,1fr)] gap-10 px-4 py-8">
                            <div className="flex flex-col gap-4 border-r border-zinc-200 pr-8">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                                Explore {parent.name}
                              </p>
                              <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">
                                {parent.name}
                              </h3>
                              <p className="text-sm leading-6 text-zinc-600">
                                {getCategorySummary(parent)}
                              </p>
                              <NavigationMenuLink asChild>
                                <Link
                                  href={getCategoryHref(parent.slug)}
                                  className="inline-flex items-center text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                                >
                                  Shop all {parent.name}
                                </Link>
                              </NavigationMenuLink>
                            </div>

                            <div className="grid auto-rows-max grid-cols-2 gap-x-8 gap-y-8 xl:grid-cols-4">
                              {sections.map(({ section, links }) => (
                                <div key={section.id} className="min-w-0">
                                  <NavigationMenuLink asChild>
                                    <Link
                                      href={getCategoryHref(section.slug)}
                                      className="mb-3 inline-flex items-center text-[15px] font-semibold text-zinc-950 transition-colors hover:text-primary"
                                    >
                                      {section.name}
                                    </Link>
                                  </NavigationMenuLink>

                                  {links.length > 0 ? (
                                    <div className="space-y-2.5">
                                      {links.map((child) => (
                                        <NavigationMenuLink key={child.id} asChild>
                                          <Link
                                            href={getCategoryHref(child.slug)}
                                            className="block text-sm leading-6 text-zinc-600 transition-colors hover:text-zinc-950"
                                          >
                                            {child.name}
                                          </Link>
                                        </NavigationMenuLink>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    );
                  } else {
                    return (
                      <NavigationMenuItem key="brands" className="static">
                        <NavigationMenuTrigger className={desktopNavigationTriggerClassName}>
                          Brands
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={desktopMegaMenuContentClassName}>
                          <div className="container mx-auto grid grid-cols-[220px_minmax(0,1fr)] gap-10 px-4 py-8">
                            <div className="flex flex-col gap-4 border-r border-zinc-200 pr-8">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                                Browse by maker
                              </p>
                              <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">
                                Brands
                              </h3>
                              <p className="text-sm leading-6 text-zinc-600">
                                Shop trusted pet, farm, garden, and home brands carried at Bay State.
                              </p>
                              <NavigationMenuLink asChild>
                                <Link
                                  href="/brands"
                                  className="inline-flex items-center text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                                >
                                  View all brands
                                </Link>
                              </NavigationMenuLink>
                            </div>

                            <div className="grid auto-rows-max grid-cols-2 gap-x-6 gap-y-2 xl:grid-cols-4">
                              {brands.slice(0, 20).map((brand) => (
                                <NavigationMenuLink key={brand.id} asChild>
                                  <Link
                                    href={`/products?brand=${brand.slug}`}
                                    className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                                  >
                                    {brand.name}
                                  </Link>
                                </NavigationMenuLink>
                              ))}
                            </div>
                          </div>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    );
                  }
                })}

                {/* More Menu */}
                {moreItems.length > 0 && (
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className={desktopNavigationTriggerClassName}>
                      More
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="top-full z-[110] w-72 overflow-hidden rounded-b-xl border border-t-0 border-zinc-200 bg-white text-zinc-900 shadow-md md:left-auto md:right-0">
                      <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Browse more
                      </div>
                      <div className="p-2">
                        {moreItems.map(item => (
                          <NavigationMenuLink key={item.id} asChild>
                            <Link
                              href={item.type === 'category' ? getCategoryHref(item.slug) : '/brands'}
                              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                            >
                              {item.name}
                            </Link>
                          </NavigationMenuLink>
                        ))}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )}

                <NavigationMenuItem className="flex-1" />


              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </header>

      <header className="md:hidden sticky top-0 z-50 w-full border-b-4 border-brand-burgundy bg-primary text-white shadow-sm h-16 flex items-center px-4">
        <div className="flex-1 flex justify-start">
          <MobileNavDrawer
            categories={categories}
            petTypes={petTypes}
            brands={brands}
            userRole={resolvedUserRole}
          />
        </div>
        
        <Link href="/" className="flex items-center group">
          <div className="h-10 w-24 relative">
            <Image
              src="/logo.png"
              alt="Bay State Logo"
              fill
              sizes="96px"
              className="object-contain"
            />
          </div>
        </Link>

        <div className="flex-1 flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-12 w-12 text-white hover:bg-zinc-900 rounded-none border-2 border-transparent active:border-zinc-900"
            aria-label={`Shopping cart, ${itemCount} items`}
            onClick={openCartDrawer}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center bg-accent text-[10px] font-bold text-secondary-foreground border border-zinc-200 rounded-lg shadow-sm">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>


      <CartDrawer isOpen={isCartDrawerOpen} onClose={closeCartDrawer} />
    </>
  );
}
