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

type StorefrontCategory = {
  id: string;
  name: string;
  slug: string | null;
  parent_id?: string | null;
  is_featured?: boolean | null;
  description?: string | null;
};

const desktopNavigationTriggerClassName =
  "h-12 rounded-none bg-transparent px-4 text-sm font-medium text-white/80 hover:bg-card/10 hover:text-white focus:bg-card/10 focus:text-white data-[state=open]:bg-card data-[state=open]:text-zinc-950 data-[state=open]:hover:bg-card data-[state=open]:focus:bg-card";

const desktopMegaMenuContentClassName =
  "left-0 right-0 top-full z-[100] w-full overflow-hidden bg-card text-foreground shadow-[0_24px_48px_rgba(15,23,42,0.12)] md:w-full";

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
  const [isCartOpen, setIsCartOpen] = useState(false);

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
      const utilityWidth = 250; // Space for "Our Services" and spacer
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
        className="max-md:hidden sticky top-0 z-50 w-full flex flex-col border-b border-[oklch(85%_0.03_160)]"
      >
        <div className="bg-primary text-white border-b border-[oklch(85%_0.03_160)] shadow-sm">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            <Link 
              href="/" 
              className="flex items-center group shrink-0 gap-3"
            >
              <div className="h-16 w-32 relative">
                <Image
                  src="/logo.png"
                  alt="Bay State Pet & Garden Supply Logo"
                  width={128}
                  height={64}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
              <div className="flex flex-col items-center">
                <span className="font-bold leading-none text-white font-display group-hover:text-accent text-4xl">
                  Bay State
                </span>
                <span className="hidden sm:block text-xs font-medium leading-none text-white/80 tracking-wide mt-1 border-t border-white/20 pt-1 text-center w-full">
                  Pet & Garden Supply
                </span>
              </div>
            </Link>

            <div className="flex-1 max-w-xl mx-12">
              <InlineSearch />
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <UserMenu user={resolvedUser} userRole={resolvedUserRole} />
              <div className="h-12 w-px bg-card/20 mx-2" />
              <Button
                variant="ghost"
                size="icon"
                className="relative h-14 w-14 text-white hover:bg-[oklch(25%_0.02_90)] rounded-none border border-transparent hover:border-[oklch(85%_0.03_160)] transition-all group"
                aria-label={`Shopping cart, ${itemCount} items`}
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-7 w-7 group-hover:scale-110 transition-transform" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center bg-primary-foreground text-[12px] font-bold text-primary border border-white/30 shadow-sm">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative border-b border-white/10 bg-[oklch(22%_0.02_160)] text-white/90 transition-all duration-300 ease-in-out">
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
                            <div className="flex flex-col gap-4 border-r border-[oklch(85%_0.03_160)] pr-8">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                                Explore {parent.name}
                              </p>
                              <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">
                                {parent.name}
                              </h3>
                              <p className="text-sm leading-6 text-muted-foreground">
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
                                      className="mb-3 inline-flex items-center text-[15px] font-semibold text-[oklch(25%_0.02_90)] transition-colors hover:text-primary"
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
                                            className="block text-sm leading-6 text-muted-foreground transition-colors hover:text-zinc-950"
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
                            <div className="flex flex-col gap-4 border-r border-[oklch(85%_0.03_160)] pr-8">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                                Browse by maker
                              </p>
                              <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">
                                Brands
                              </h3>
                              <p className="text-sm leading-6 text-muted-foreground">
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
                                    className="block rounded-md px-3 py-2 text-sm font-medium text-[oklch(25%_0.02_90)] transition-colors hover:bg-[oklch(96%_0.01_90)] hover:text-[oklch(25%_0.02_90)]"
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
                    <NavigationMenuContent className="top-full z-[110] w-72 overflow-hidden rounded-b-xl border border-t-0 border-[oklch(85%_0.03_160)] bg-card text-foreground shadow-[0_16px_32px_rgba(15,23,42,0.16)] md:left-auto md:right-0">
                      <div className="text-xs font-medium text-muted-foreground px-3 py-2">
                        Browse more
                      </div>
                      <div className="p-2">
                        {moreItems.map(item => (
                          <NavigationMenuLink key={item.id} asChild>
                            <Link
                              href={item.type === 'category' ? getCategoryHref(item.slug) : '/brands'}
                              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-zinc-950"
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

                {/* Utility Links */}
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/services"
                      className="group inline-flex h-12 w-max items-center justify-center px-4 text-sm font-medium text-white/70 transition-colors hover:text-white focus:text-white"
                    >
                      Our Services
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </header>

      <header className="md:hidden sticky top-0 z-50 w-full border-b border-[oklch(85%_0.03_160)] bg-primary text-white shadow-sm flex h-20 items-center justify-between px-4">
        <MobileNavDrawer
          categories={categories}
          petTypes={petTypes}
          brands={brands}
          userRole={resolvedUserRole}
        />
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-12 w-12 relative">
            <Image
              src="/logo.png"
              alt="Bay State Logo"
              fill
              sizes="48px"
              className="object-contain"
            />
          </div>
          <span className="font-bold text-white tracking-tight text-xl">
            Bay State
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <InlineSearch />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-12 w-12 text-white hover:bg-[oklch(25%_0.02_90)] rounded-none border border-transparent active:border-[oklch(85%_0.03_160)]"
            aria-label={`Shopping cart, ${itemCount} items`}
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center bg-primary-foreground text-[10px] font-bold text-primary border border-white/30 shadow-sm">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>


      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
