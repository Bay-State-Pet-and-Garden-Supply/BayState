"use client";

import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingCart, ChevronDownIcon, Heart } from "lucide-react";
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
import { CampaignBanner } from '@/components/storefront/campaign-banner';
import type { CampaignBannerSettings } from '@/lib/settings';
import { useUIStore } from "@/lib/storefront/ui-store";
import { getCategoryUrl, getBrandUrl } from "@/lib/urls";

type StorefrontCategory = {
  id: string;
  name: string;
  slug: string | null;
  parent_id?: string | null;
  is_featured?: boolean | null;
  description?: string | null;
};

const desktopNavTriggerClass =
  "h-12 rounded-none border-0 bg-transparent px-4 text-sm font-medium text-white/80 hover:bg-white/8 hover:text-white data-[state=open]:bg-white data-[state=open]:text-zinc-950";

const desktopMegaMenuClass =
  "left-0 right-0 top-full z-[100] w-full overflow-y-auto max-h-[calc(100vh-8rem)] rounded-b-2xl border border-t-0 border-zinc-200 bg-white text-zinc-900 shadow-lg md:w-full";

function normalizeStorefrontUserRole(user: User | null): string | null {
  const metadataRoles = [user?.app_metadata?.role, user?.user_metadata?.role];

  for (const role of metadataRoles) {
    if (role === "admin" || role === "staff" || role === "customer") {
      return role;
    }
  }

  return null;
}

function getCategoryHref(slug: string | null): string {
  return getCategoryUrl(slug);
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
  brands: Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
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

      if (!isActive) return;
      setClientUser(currentUser ?? null);
      setClientUserRole(normalizeStorefrontUserRole(currentUser ?? null));
    }

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
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

  const { topLevel, childrenMap } = useMemo(() => {
    const topLevel = categories.filter((c) => !c.parent_id);
    const childrenMap = new Map<string, StorefrontCategory[]>();

    for (const category of categories) {
      if (!category.parent_id) continue;
      const siblings = childrenMap.get(category.parent_id) ?? [];
      siblings.push(category);
      childrenMap.set(category.parent_id, siblings);
    }

    return { topLevel, childrenMap };
  }, [categories]);

  const primaryNavCategories = topLevel;

  const allNavItems = useMemo(
    () => [
      ...primaryNavCategories.map((c) => ({ ...c, type: "category" as const })),
      { id: "brands", name: "Brands", type: "brands" as const },
    ],
    [primaryNavCategories],
  );

  const [visibleCount, setVisibleCount] = useState(allNavItems.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemWidthsRef = useRef<number[]>([]);
  const moreButtonWidthRef = useRef(100);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const items = containerRef.current.querySelectorAll(".nav-item-measure");
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
      const availableWidth = width - 100;

      let currentWidth = 0;
      let count = 0;

      for (let i = 0; i < itemWidthsRef.current.length; i++) {
        const itemWidth = itemWidthsRef.current[i];
        const isLastItem = i === itemWidthsRef.current.length - 1;

        if (isLastItem) {
          count = currentWidth + itemWidth <= availableWidth ? i + 1 : i;
        } else {
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
      {campaignBanner?.enabled && campaignBanner.messages.length > 0 ? (
        <CampaignBanner
          messages={campaignBanner.messages}
          variant={campaignBanner.variant}
          cycleInterval={campaignBanner.cycleInterval}
        />
      ) : null}
      {/* Desktop header */}
      <header className="max-md:hidden sticky top-0 z-50 flex w-full flex-col shadow-md">
        <div className="border-b-2 border-brand-forest-green bg-[#1a3d26] text-white">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            <Link href="/" className="flex shrink-0 items-center group">
              <div className="relative h-14 w-44">
                <Image
                  src="/logo.png"
                  alt="Bay State Pet & Garden Supply"
                  width={176}
                  height={56}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
            </Link>

            <div className="mx-10 max-w-xl flex-1">
              <InlineSearch />
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {(resolvedUserRole === 'admin' || resolvedUserRole === 'staff') && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-10 rounded-sm border border-white/20 px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-white/20"
                >
                  <Link href="/admin">Admin</Link>
                </Button>
              )}
              <UserMenu user={resolvedUser} />
              <div className="mx-1 h-8 w-px bg-white/15" />
              <Link href="/account/favorites">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-xl text-white transition-colors hover:bg-white/10"
                  aria-label="View Favorites"
                >
                  <Heart className="h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-11 w-11 rounded-xl text-white transition-colors hover:bg-white/10"
                aria-label={`Shopping cart, ${itemCount} items`}
                onClick={openCartDrawer}
              >
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-[11px] font-bold text-black shadow-sm">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-white/10 bg-[#143522] text-white/85">
          <div
            className="container mx-auto flex h-12 items-center px-4"
            ref={containerRef}
          >
            <NavigationMenu
              className="flex w-full max-w-none"
              aria-label="Main navigation"
              viewport={false}
            >
              <div
                className="pointer-events-none absolute flex whitespace-nowrap opacity-0"
                aria-hidden="true"
              >
                {allNavItems.map((item) => (
                  <div
                    key={item.id}
                    className="nav-item-measure flex h-12 items-center px-4 text-sm font-medium text-white/80"
                  >
                    {item.name}
                    <ChevronDownIcon className="ml-1 size-3" />
                  </div>
                ))}
              </div>

              <NavigationMenuList className="w-full justify-start gap-0">
                {visibleItems.map((item) => {
                  if (item.type === "category") {
                    const parent = item;
                    const sections = (childrenMap.get(parent.id) || []).map((section) => ({
                      section,
                      links: childrenMap.get(section.id) || [],
                    }));

                    if (sections.length === 0) return null;

                    return (
                      <NavigationMenuItem key={parent.id} className="static">
                        <NavigationMenuTrigger className={desktopNavTriggerClass}>
                          {parent.name}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={desktopMegaMenuClass}>
                          <div className="container mx-auto grid grid-cols-[220px_minmax(0,1fr)] gap-10 px-4 py-8">
                            <div className="flex flex-col gap-4 border-r border-zinc-200 pr-8">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/70">
                                Explore {parent.name}
                              </p>
                              <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">
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
                  }

                  return (
                    <NavigationMenuItem key="brands" className="static">
                      <NavigationMenuTrigger className={desktopNavTriggerClass}>
                        Brands
                      </NavigationMenuTrigger>
                      <NavigationMenuContent className={desktopMegaMenuClass}>
                        <div className="container mx-auto grid grid-cols-[220px_minmax(0,1fr)] gap-10 px-4 py-8">
                          <div className="flex flex-col gap-4 border-r border-zinc-200 pr-8">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/70">
                              Browse by maker
                            </p>
                            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">
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
                                  href={getBrandUrl(brand.slug)}
                                  className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
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
                })}

                {moreItems.length > 0 ? (
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className={desktopNavTriggerClass}>
                      More
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="right-0 top-full z-[110] w-72 overflow-y-auto max-h-[calc(100vh-8rem)] rounded-b-xl border border-t-0 border-zinc-200 bg-white text-zinc-900 shadow-md md:left-auto">
                      <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Browse more
                      </div>
                      <div className="p-2">
                        {moreItems.map((item) => (
                          <NavigationMenuLink key={item.id} asChild>
                            <Link
                              href={
                                item.type === "category"
                                  ? getCategoryHref(item.slug)
                                  : "/brands"
                              }
                              className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                            >
                              {item.name}
                            </Link>
                          </NavigationMenuLink>
                        ))}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                ) : null}

                <NavigationMenuItem className="flex-1" />
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </header>

      {/* Mobile header */}
      <header className="sticky top-0 z-50 flex h-16 w-full items-center border-b-2 border-brand-forest-green bg-[#1a3d26] px-4 text-white shadow-sm md:hidden">
        <div className="flex flex-1 justify-start">
          <MobileNavDrawer
            categories={categories}
            petTypes={petTypes}
            brands={brands}
            userRole={resolvedUserRole}
          />
        </div>

        <Link href="/" className="flex items-center">
          <div className="relative h-10 w-24">
            <Image src="/logo.png" alt="Bay State" fill sizes="96px" className="object-contain" />
          </div>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2">
          <Link href="/account/favorites">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl text-white hover:bg-white/10"
              aria-label="Favorites"
            >
              <Heart className="h-5 w-5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-xl text-white hover:bg-white/10"
            aria-label={`Cart, ${itemCount} items`}
            onClick={openCartDrawer}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-black shadow-sm">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>

      <CartDrawer isOpen={isCartDrawerOpen} onClose={closeCartDrawer} />
    </>
  );
}
