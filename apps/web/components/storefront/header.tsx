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
}) {
  const itemCount = useCartStore((state) => state.getItemCount());
  const isScrolled = useScroll(50);
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
          "max-md:hidden sticky top-0 z-50 w-full flex flex-col border-b-2 border-zinc-900 transition-all duration-300 ease-in-out",
          isScrolled ? "shadow-md" : ""
        )}
      >
        {/* Tier 1: Pre-Header */}
        <div 
          className={cn(
            "bg-zinc-900 py-2 px-4 text-[10px] font-black tracking-[0.25em] text-white flex justify-between items-center border-b-2 border-white/5 uppercase transition-all duration-300 ease-in-out overflow-hidden",
            isScrolled ? "h-0 py-0 opacity-0 border-b-0" : "h-10"
          )}
        >
          <div className="container mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-accent">★</span>
              From big to small, we feed them all!
              <span className="text-accent">★</span>
            </div>
            <div className="flex gap-6">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <Facebook className="h-3 w-3" />
                <span>FACEBOOK</span>
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <Twitter className="h-3 w-3" />
                <span>TWITTER</span>
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <Instagram className="h-3 w-3" />
                <span>INSTAGRAM</span>
              </a>
            </div>
          </div>
        </div>


        {/* Tier 2: Main Header Logo & Actions */}
        <div className="bg-primary text-white border-b-4 border-zinc-900 shadow-[0_4px_0_rgba(0,0,0,1)] transition-all duration-300 ease-in-out">
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
                    "font-black leading-none tracking-tighter text-white uppercase font-display group-hover:text-accent transition-all duration-300 ease-in-out",
                    isScrolled ? "text-4xl" : "text-4xl"
                  )}
                >
                  Bay State
                </span>
                <span 
                  className={cn(
                    "hidden sm:text-xs font-black sm:inline leading-none text-white/80 uppercase tracking-[0.2em] mt-1 border-t border-white/20 pt-1 transition-all duration-300 ease-in-out",
                    isScrolled ? "opacity-0 h-0 mt-0 pt-0 overflow-hidden border-t-0" : "opacity-100"
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
              <div className="h-12 w-px bg-white/20 mx-2" />
              <Button
                variant="ghost"
                size="icon"
                className="relative h-14 w-14 text-white hover:bg-zinc-900 rounded-none border-4 border-transparent hover:border-zinc-900 transition-all group"
                aria-label="Shopping cart"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-7 w-7 group-hover:scale-110 transition-transform" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center bg-accent text-[12px] font-black text-secondary border-4 border-zinc-900 shadow-[2px_2px_0_rgba(0,0,0,1)]">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>


        {/* Tier 3: Navigation Bar (Mega Menu) */}
        <div className="bg-zinc-900 text-white border-b-2 border-zinc-900 relative transition-all duration-300 ease-in-out">
          <div className="container mx-auto flex h-11 items-center px-4 transition-all duration-300 ease-in-out" ref={containerRef}>
            <NavigationMenu className="flex w-full max-w-none" aria-label="Main Navigation" viewport={false}>
              
              {/* Hidden container for measurement */}
              <div className="absolute opacity-0 pointer-events-none flex whitespace-nowrap" aria-hidden="true">
                 {allNavItems.map(item => (
                   <div key={item.id} className="nav-item-measure px-6 font-display font-black text-[13px] tracking-tighter h-11 flex items-center border-r-2 border-white/10">
                     {item.name}
                     <ChevronDownIcon className="ml-1 size-3" />
                   </div>
                 ))}
              </div>

              <NavigationMenuList className="w-full justify-start gap-0">
                {visibleItems.map((item, index) => {
                  const isRightAligned = index >= visibleItems.length / 2;
                  const contentClassName = cn(
                    "top-full p-0 z-[100] shadow-none mt-0 border-0 rounded-none",
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
                        <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-tighter text-[13px] h-11 px-6 rounded-none hover:bg-white/10 data-[state=open]:bg-accent data-[state=open]:text-zinc-900 transition-all font-display border-r-2 border-white/10">
                          {displayName}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={contentClassName}>
                          <div className="mt-0 flex gap-8 p-10 w-max max-w-[calc(100vw-2rem)] min-w-[500px] text-zinc-900 bg-zinc-50 border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                            {columns.map((col, idx) => (
                              <div key={idx} className="flex flex-col gap-3 min-w-[220px]">
                                  {/* Show header only on first column, mock others to align grid */}
                                  {idx === 0 ? (
                                  <h4 className="font-black text-2xl mb-4 border-b-8 border-primary pb-2 text-zinc-900 tracking-tighter uppercase font-display">
                                    {displayName}
                                  </h4>
                                ) : (
                                  <div className="h-[44px] mb-4 border-b-8 border-transparent" />
                                )}
                                
                                <div className="flex flex-col gap-1">
                                  {col.map(child => {
                                    return (
                                      <NavigationMenuLink key={child.id} asChild>
                                        <Link
                                          href={`/products?category=${child.slug}`}
                                          className="text-xs font-black text-zinc-500 hover:text-primary hover:bg-white p-2 border-2 border-transparent hover:border-zinc-900 transition-all uppercase tracking-tight flex items-center gap-2 group"
                                        >
                                          <span className="h-1 w-0 bg-primary group-hover:w-3 transition-all" />
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
                    // Brands Dropdown
                    return (
                      <NavigationMenuItem key="brands">
                        <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-tighter text-[13px] h-11 px-6 rounded-none hover:bg-white/10 data-[state=open]:bg-accent data-[state=open]:text-zinc-900 transition-all font-display border-r-2 border-white/10">
                          Brands
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={contentClassName}>
                          <div className="mt-0 w-max max-w-[calc(100vw-2rem)] md:w-[700px] p-10 text-zinc-900 bg-zinc-50 border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                            <h4 className="font-black text-2xl mb-6 border-b-8 border-primary pb-2 text-zinc-900 tracking-tighter uppercase font-display">
                              Featured Brands
                            </h4>
                            <div className="grid grid-cols-3 gap-x-10 gap-y-2">
                              {brands.slice(0, 15).map((brand) => (
                                <NavigationMenuLink key={brand.id} asChild>
                                  <Link
                                    href={`/products?brand=${brand.slug}`}
                                    className="text-xs font-black text-zinc-500 hover:text-primary hover:bg-white p-2 border-2 border-transparent hover:border-zinc-900 transition-all uppercase tracking-tight truncate"
                                  >
                                    {brand.name}
                                  </Link>
                                </NavigationMenuLink>
                              ))}
                            </div>
                            <div className="mt-10 pt-8 border-t-4 border-zinc-200 flex justify-end">
                              <NavigationMenuLink asChild>
                                <Link href="/brands" className="text-xs font-black text-white uppercase tracking-[0.25em] bg-zinc-900 py-4 px-8 border-b-4 border-black/30 hover:bg-primary transition-colors shadow-lg active:translate-y-1 active:border-b-0">
                                  View All Brands →
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
                    <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-tighter text-[13px] h-11 px-6 rounded-none hover:bg-white/10 data-[state=open]:bg-accent data-[state=open]:text-zinc-900 transition-all font-display border-r-2 border-white/10">
                      More
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="md:left-auto md:right-0 top-full p-0 z-[100] shadow-none mt-0 border-0 rounded-none">
                      <div className="mt-0 w-64 p-6 text-zinc-900 bg-zinc-50 border-4 border-zinc-900 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
                        {moreItems.map(item => (
                          <NavigationMenuLink key={item.id} asChild>
                            <Link
                              href={item.type === 'category' ? `/products?category=${item.slug}` : '/brands'}
                              className="text-xs font-black text-zinc-500 hover:text-primary hover:bg-white p-2 border-2 border-transparent hover:border-zinc-900 transition-all uppercase tracking-tight flex items-center gap-2 group"
                            >
                              <span className="h-1 w-0 bg-primary group-hover:w-3 transition-all" />
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
                      className="group inline-flex h-11 w-max items-center justify-center rounded-none bg-transparent px-8 py-2 text-[11px] uppercase tracking-[0.25em] font-black text-white/40 transition-colors hover:text-white focus:text-white"
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

      {/* Mobile Header (Retains original Drawer structure) */}
      <header className="md:hidden sticky top-0 z-50 w-full border-b-4 border-zinc-900 bg-primary text-white shadow-sm flex h-20 items-center justify-between px-4">
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
          <span className="font-black text-white uppercase tracking-tighter text-xl">
            Bay State
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <InlineSearch />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-12 w-12 text-white hover:bg-zinc-900 rounded-none border-2 border-transparent active:border-zinc-900"
            aria-label="Shopping cart"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center bg-accent text-[10px] font-black text-secondary border-2 border-zinc-900 shadow-[2px_2px_0_rgba(0,0,0,1)]">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>


      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
