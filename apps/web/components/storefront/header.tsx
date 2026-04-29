"use client";

import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Facebook,
  Instagram,
  Twitter,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineSearch } from "@/components/storefront/inline-search";
import { useCartStore } from "@/lib/cart-store";
import { cn } from "@/lib/utils";
import { useScroll } from "@/hooks/use-scroll";
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
  categories: Array<{
    id: string;
    name: string;
    slug: string | null;
    parent_id?: string | null;
    is_featured?: boolean | null;
  }>;
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
  const isScrolled = useScroll(50);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Dynamic Topbar Logic
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const bannerEnabled = campaignBanner?.enabled && campaignBanner?.messages && campaignBanner.messages.length > 0;
  const messages = campaignBanner?.messages || [];
  const cycleInterval = campaignBanner?.cycleInterval || 5000;

  useEffect(() => {
    if (!bannerEnabled || messages.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
        setIsTransitioning(false);
      }, 300);
    }, cycleInterval);

    return () => clearInterval(interval);
  }, [bannerEnabled, messages.length, cycleInterval]);

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
    const childrenMap = new Map<string, typeof categories>();
    
    topLevel.forEach(parent => {
      const children = categories
        .filter((c) => c.parent_id === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      childrenMap.set(parent.id, children);
    });

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
        data-scrolled={isScrolled}
        className={cn(
          "sticky top-0 z-50 hidden w-full flex-col border-b border-[var(--surface-storefront-border)] bg-[rgba(246,241,230,0.92)] backdrop-blur max-md:hidden transition-all duration-300 ease-in-out",
          isScrolled ? "shadow-sm" : ""
        )}
      >
        <div 
          className={cn(
            "overflow-hidden border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] px-4 py-2 text-[11px] font-medium text-zinc-700 transition-all duration-300 ease-in-out",
            isScrolled ? "h-0 py-0 opacity-0 border-b-0" : "min-h-[32px]"
          )}
        >
          <div className="container mx-auto flex justify-between items-center">
            <div className={cn(
              "flex items-center gap-2 transition-opacity duration-300",
              isTransitioning ? "opacity-0" : "opacity-100"
            )}>
              <span className="text-accent">•</span>
              {bannerEnabled ? (
                <>
                  {messages[currentMessageIndex].text}
                  {messages[currentMessageIndex].linkText && messages[currentMessageIndex].linkHref && (
                    <Link 
                      href={messages[currentMessageIndex].linkHref!} 
                      className="ml-2 text-accent hover:underline underline-offset-4"
                    >
                      {messages[currentMessageIndex].linkText}
                    </Link>
                  )}
                </>
              ) : (
                "From big to small, we feed them all!"
              )}
              <span className="text-accent">•</span>
            </div>
            <div className="flex gap-6 text-zinc-500">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-zinc-900"
              >
                <Facebook className="h-3 w-3" />
                <span>Facebook</span>
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-zinc-900"
              >
                <Twitter className="h-3 w-3" />
                <span>Twitter</span>
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-zinc-900"
              >
                <Instagram className="h-3 w-3" />
                <span>Instagram</span>
              </a>
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--surface-storefront-border)] bg-[rgba(255,253,248,0.96)] text-zinc-900 transition-all duration-300 ease-in-out">
          <div 
            className={cn(
              "container mx-auto flex items-center justify-between px-4 transition-all duration-300 ease-in-out",
              isScrolled ? "h-20" : "h-24"
            )}
          >
            <Link 
              href="/" 
              className={cn(
                "flex items-center group shrink-0 transition-all duration-300 ease-in-out",
                isScrolled ? "gap-2" : "gap-4"
              )}
            >
              <div 
                className={cn(
                  "relative transition-all duration-300 ease-in-out",
                  isScrolled ? "h-16 w-16" : "h-16 w-16"
                )}
              >
                <Image
                  src="/logo.png"
                  alt="Bay State Pet & Garden Supply Logo"
                  fill
                  sizes="64px"
                  className="object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col">
                <span 
                  className={cn(
                    "font-display leading-none text-zinc-900 transition-all duration-300 ease-in-out group-hover:text-primary font-bold tracking-tight",
                    isScrolled ? "text-4xl" : "text-4xl"
                  )}
                >
                  Bay State
                </span>
                <span 
                  className={cn(
                    "mt-1 hidden border-t border-zinc-200 pt-1 text-center text-xs font-medium leading-none text-zinc-500 sm:block transition-all duration-300 ease-in-out",
                    isScrolled ? "hidden" : ""
                  )}
                >
                  Pet & Garden Supply
                </span>
              </div>
            </Link>

            <div className="flex-1 max-w-xl mx-12">
              <InlineSearch />
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <UserMenu user={resolvedUser} userRole={resolvedUserRole} />
              <div className="mx-2 h-12 w-px bg-zinc-200" />
              <Button
                variant="ghost"
                size="icon"
                className="group relative h-12 w-12 rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                aria-label="Shopping cart"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-6 w-6 transition-transform group-hover:scale-105" />
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-secondary shadow-sm">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative border-b border-[var(--surface-storefront-border)] bg-[rgba(255,253,248,0.92)] text-zinc-900 transition-all duration-300 ease-in-out">
          <div className="container mx-auto flex h-11 items-center px-4 transition-all duration-300 ease-in-out" ref={containerRef}>
            <NavigationMenu className="flex w-full max-w-none" aria-label="Main Navigation" viewport={false}>
              
              {/* Hidden container for measurement */}
              <div className="absolute opacity-0 pointer-events-none flex whitespace-nowrap" aria-hidden="true">
                 {allNavItems.map(item => (
                    <div key={item.id} className="nav-item-measure flex h-11 items-center px-6 text-[13px] font-medium text-zinc-900">
                      {item.name}
                      <ChevronDownIcon className="ml-1 size-3" />
                    </div>
                 ))}
              </div>

              <NavigationMenuList className="w-full justify-start gap-0">
                {visibleItems.map((item, index) => {
                  const isRightAligned = index >= visibleItems.length / 2;
                  const contentClassName = cn(
                    "top-full z-[100] mt-2 border-0 bg-transparent p-0",
                    isRightAligned ? "md:left-auto md:right-0" : "left-0"
                  );

                  if (item.type === 'category') {
                    const parent = item;
                    const children = childrenMap.get(parent.id) || [];
                    if (children.length === 0) return null;

                    const displayName = parent.name;

                    // Split into columns of 8
                    const chunkSize = 8;
                    const columns = [];
                    for (let i = 0; i < children.length; i += chunkSize) {
                      columns.push(children.slice(i, i + chunkSize));
                    }

                    return (
                      <NavigationMenuItem key={parent.id}>
                        <NavigationMenuTrigger className="h-11 rounded-full bg-transparent px-5 text-[14px] font-medium text-zinc-700 hover:bg-white hover:text-zinc-900 data-[state=open]:bg-white data-[state=open]:text-zinc-900">
                          {displayName}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={contentClassName}>
                          <div className="mt-0 flex min-w-[500px] w-max max-w-[calc(100vw-2rem)] gap-8 rounded-[1.5rem] border border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-card)] p-8 text-zinc-900 shadow-[var(--shadow-warm-md)]">
                            {columns.map((col, idx) => (
                              <div key={idx} className="flex flex-col gap-3 min-w-[220px]">
                                  {idx === 0 ? (
                                  <h4 className="mb-4 border-b border-[var(--surface-storefront-border)] pb-3 font-display text-2xl font-bold tracking-tight text-zinc-900">
                                     {displayName}
                                   </h4>
                                 ) : (
                                  <div className="mb-4 h-[44px] border-b border-transparent" />
                                 )}
                                 
                                <div className="flex flex-col gap-1">
                                  {col.map(child => {
                                    return (
                                      <NavigationMenuLink key={child.id} asChild>
                                        <Link
                                          href={`/products?category=${child.slug}`}
                                          className="group flex items-center gap-2 rounded-xl p-2 text-sm font-medium text-zinc-600 transition-all hover:bg-white hover:text-primary"
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full bg-primary/35 transition-all group-hover:scale-125 group-hover:bg-primary" />
                                          {child.name}
                                        </Link>
                                      </NavigationMenuLink>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    );
                  } else {
                    return (
                      <NavigationMenuItem key="brands">
                        <NavigationMenuTrigger className="h-11 rounded-full bg-transparent px-5 text-[14px] font-medium text-zinc-700 hover:bg-white hover:text-zinc-900 data-[state=open]:bg-white data-[state=open]:text-zinc-900">
                          Brands
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={contentClassName}>
                          <div className="mt-0 w-max max-w-[calc(100vw-2rem)] rounded-[1.5rem] border border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-card)] p-8 text-zinc-900 shadow-[var(--shadow-warm-md)] md:w-[700px]">
                            <h4 className="mb-6 border-b border-[var(--surface-storefront-border)] pb-3 font-display text-2xl font-bold tracking-tight text-zinc-900">
                              Featured Brands
                            </h4>
                            <div className="grid grid-cols-3 gap-x-10 gap-y-2">
                              {brands.slice(0, 15).map((brand) => (
                                <NavigationMenuLink key={brand.id} asChild>
                                  <Link
                                    href={`/products?brand=${brand.slug}`}
                                    className="truncate rounded-xl p-2 text-sm font-medium text-zinc-600 transition-all hover:bg-white hover:text-primary"
                                  >
                                    {brand.name}
                                  </Link>
                                </NavigationMenuLink>
                              ))}
                            </div>
                            <div className="mt-10 flex justify-end border-t border-[var(--surface-storefront-border)] pt-6">
                              <NavigationMenuLink asChild>
                                <Link href="/brands" className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary">
                                  View all brands
                                </Link>
                              </NavigationMenuLink>
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
                    <NavigationMenuTrigger className="h-11 rounded-full bg-transparent px-5 text-[14px] font-medium text-zinc-700 hover:bg-white hover:text-zinc-900 data-[state=open]:bg-white data-[state=open]:text-zinc-900">
                      More
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="md:left-auto md:right-0 top-full z-[100] mt-2 border-0 bg-transparent p-0">
                      <div className="mt-0 flex w-64 flex-col gap-2 rounded-[1.5rem] border border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-card)] p-6 text-zinc-900 shadow-[var(--shadow-warm-md)]">
                        {moreItems.map(item => (
                          <NavigationMenuLink key={item.id} asChild>
                            <Link
                              href={item.type === 'category' ? `/products?category=${item.slug}` : '/brands'}
                              className="group flex items-center gap-2 rounded-xl p-2 text-sm font-medium text-zinc-600 transition-all hover:bg-white hover:text-primary"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-primary/35 transition-all group-hover:scale-125 group-hover:bg-primary" />
                              {item.name}
                            </Link>
                          </NavigationMenuLink>
                        ))}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )}

                <div className="flex-1" />

                {/* Utility Links */}
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/services"
                      className="group inline-flex h-11 w-max items-center justify-center rounded-full bg-transparent px-6 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 focus:text-zinc-900"
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

      <header className="sticky top-0 z-50 flex h-20 items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[rgba(255,253,248,0.96)] px-4 text-zinc-900 shadow-sm md:hidden">
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
          <span className="font-display text-xl font-bold tracking-tight text-zinc-900">
            Bay State
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <InlineSearch />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-11 w-11 rounded-full border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
            aria-label="Shopping cart"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-secondary shadow-sm">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>


      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
