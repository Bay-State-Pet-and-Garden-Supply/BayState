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
        <div className="bg-zinc-900 py-1.5 px-4 text-[10px] font-black tracking-[0.2em] text-white flex justify-between items-center border-b border-white/10 uppercase">
          <div className="container mx-auto flex justify-between items-center">
            <div>
              From big to small, we feed them all!
            </div>
            <div className="flex gap-4">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                <Facebook className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                <Twitter className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                <Instagram className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Tier 2: Main Header Logo & Actions */}
        <div className="bg-primary text-white border-b border-primary-foreground/10">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="h-16 w-16 relative bg-white p-1.5 border-2 border-black/20">
                <Image
                  src="/logo.png"
                  alt="Bay State Pet & Garden Supply Logo"
                  fill
                  sizes="64px"
                  className="object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col group-hover:underline underline-offset-4">
                <span className="text-3xl font-black leading-none tracking-tighter text-white uppercase italic">
                  Bay State
                </span>
                <span className="hidden sm:text-[11px] font-black sm:inline leading-none text-accent uppercase tracking-[0.15em] mt-0.5">
                  Pet & Garden Supply
                </span>
              </div>
            </Link>

            <div className="flex-1 max-w-lg mx-8 flex justify-end">
              <InlineSearch />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <UserMenu user={resolvedUser} userRole={resolvedUserRole} />
              <Button
                variant="ghost"
                size="icon"
                className="relative h-12 w-12 text-white hover:bg-white/10 rounded-none border-2 border-transparent hover:border-white/20"
                aria-label="Shopping cart"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-accent text-[11px] font-black text-secondary border-2 border-primary">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Tier 3: Navigation Bar (Mega Menu) */}
        <div className="bg-zinc-800 text-white border-t border-white/5">
          <div className="container mx-auto flex h-12 items-center px-4">
            <NavigationMenu className="flex" aria-label="Main Navigation">
              <NavigationMenuList className="gap-1">
                
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
                    <NavigationMenuItem key={parent.id}>
                      <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-widest text-xs h-12 rounded-none hover:bg-white/10 data-[state=open]:bg-white/10 transition-colors">
                        {displayName}
                      </NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="flex gap-8 p-8 w-max min-w-[450px] text-zinc-900 bg-white border-2 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,0.1)] rounded-none">
                          {columns.map((col, idx) => (
                            <div key={idx} className="flex flex-col gap-2.5 min-w-[200px]">
                                {/* Show header only on first column, mock others to align grid */}
                                {idx === 0 ? (
                                <h4 className="font-black text-xl mb-3 border-b-4 border-primary/20 pb-2 text-zinc-900 tracking-tighter uppercase italic">
                                  {displayName}
                                </h4>
                              ) : (
                                <h4 className="font-black text-xl mb-3 border-b-4 border-transparent pb-2 text-transparent select-none uppercase italic">
                                  -
                                </h4>
                              )}
                              
                              {col.map(child => {
                                return (
                                  <NavigationMenuLink key={child.id} asChild>
                                    <Link
                                      href={`/products?category=${child.slug}`}
                                      className="text-sm font-bold text-zinc-600 hover:text-primary hover:translate-x-1 transition-all uppercase tracking-tight"
                                    >
                                      {child.name}
                                    </Link>
                                  </NavigationMenuLink>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  );
                })}

                {/* Brands Dropdown */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-white font-black uppercase tracking-widest text-xs h-12 rounded-none hover:bg-white/10 data-[state=open]:bg-white/10 transition-colors">
                    Brands
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[650px] p-8 text-zinc-900 bg-white border-2 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,0.1)] rounded-none">
                      <h4 className="font-black text-xl mb-5 border-b-4 border-primary/20 pb-2 text-zinc-900 tracking-tighter uppercase italic">
                        Top Brands
                      </h4>
                      <div className="grid grid-cols-3 gap-x-8 gap-y-3">
                        {brands.slice(0, 15).map((brand) => (
                          <NavigationMenuLink key={brand.id} asChild>
                            <Link
                              href={`/products?brand=${brand.slug}`}
                              className="text-sm font-bold text-zinc-600 hover:text-primary hover:underline underline-offset-2 truncate uppercase tracking-tight"
                            >
                              {brand.name}
                            </Link>
                          </NavigationMenuLink>
                        ))}
                      </div>
                      <div className="mt-8 pt-6 border-t-2 border-zinc-100 flex justify-end">
                        <NavigationMenuLink asChild>
                          <Link href="/brands" className="text-xs font-black text-primary uppercase tracking-[0.2em] hover:underline bg-zinc-50 py-2 px-4 border border-zinc-200">
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
                      className="group inline-flex h-12 w-max items-center justify-center rounded-none bg-transparent px-6 py-2 text-[11px] uppercase tracking-[0.2em] font-black text-zinc-400 transition-colors hover:text-white focus:text-white"
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
      <header className="md:hidden sticky top-0 z-50 w-full border-b-2 border-zinc-900 bg-primary text-white shadow-sm flex h-16 items-center justify-between px-4">
        <MobileNavDrawer
          categories={categories}
          petTypes={petTypes}
          brands={brands}
          userRole={resolvedUserRole}
        />
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-10 w-10 relative bg-white rounded-none p-1 border border-black/10">
            <Image
              src="/logo.png"
              alt="Bay State Logo"
              fill
              sizes="40px"
              className="object-contain"
            />
          </div>
          <span className="font-black text-white uppercase italic tracking-tighter">
            Bay State
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <InlineSearch />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-11 w-11 text-white hover:bg-white/10 rounded-none"
            aria-label="Shopping cart"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-accent text-[10px] font-black text-secondary border-2 border-primary">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
