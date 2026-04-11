"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Facebook,
  Instagram,
  Twitter,
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

  return (
    <>
      <header className="max-md:hidden sticky top-0 z-50 w-full flex flex-col border-b-2 border-zinc-900">
        {/* Tier 1: Pre-Header */}
        <div className="bg-zinc-900 py-2 px-4 text-[10px] font-black tracking-[0.25em] text-white flex justify-between items-center border-b-2 border-white/5 uppercase">
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
        <div className="bg-primary text-white border-b-4 border-zinc-900 shadow-[0_4px_0_rgba(0,0,0,0.1)]">
          <div className="container mx-auto flex h-24 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-4 group shrink-0">
              <div className="h-16 w-16 relative">
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
                <span className="text-4xl font-black leading-none tracking-tighter text-white uppercase font-display group-hover:text-accent transition-colors">
                  Bay State
                </span>
                <span className="hidden sm:text-xs font-black sm:inline leading-none text-white/80 uppercase tracking-[0.2em] mt-1 border-t border-white/20 pt-1">
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
        <div className="bg-zinc-900 text-white border-b-2 border-zinc-900 relative">
          <div className="container mx-auto flex h-14 items-center px-4">
            <NavigationMenu className="flex" aria-label="Main Navigation" viewport={false}>

              <NavigationMenuList className="gap-2">

                
                {/* Dynamic Mega Menu for each primary department */}
                {primaryNavCategories.map(parent => {
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
                    <NavigationMenuItem key={parent.id} className="static">
                      <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-widest text-[11px] h-14 rounded-none hover:bg-white/10 data-[state=open]:bg-accent data-[state=open]:text-secondary transition-all font-display border-x-2 border-transparent hover:border-white/20">
                        {displayName}
                      </NavigationMenuTrigger>
                      <NavigationMenuContent className="left-0 top-full w-full p-0 z-[100] shadow-none">
                        <div className="mt-0 flex gap-8 p-10 w-screen max-w-[calc(100vw-2rem)] md:w-max min-w-[500px] text-zinc-900 bg-zinc-50 border-4 border-zinc-900 rounded-none shadow-none">


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
                })}

                {/* Brands Dropdown */}
                <NavigationMenuItem className="static">
                  <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-widest text-[11px] h-14 rounded-none hover:bg-white/10 data-[state=open]:bg-accent data-[state=open]:text-secondary transition-all border-x-2 border-transparent hover:border-white/20">
                    Brands
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="left-0 top-full w-full p-0 z-[100] shadow-none">
                    <div className="mt-0 w-screen max-w-[calc(100vw-2rem)] md:w-[700px] p-10 text-zinc-900 bg-zinc-50 border-4 border-zinc-900 rounded-none shadow-none">


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


                <div className="flex-1" />

                {/* Utility Links */}
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/services"
                      className="group inline-flex h-14 w-max items-center justify-center rounded-none bg-transparent px-8 py-2 text-[11px] uppercase tracking-[0.25em] font-black text-white/40 transition-colors hover:text-white focus:text-white"
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
