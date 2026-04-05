"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Dog,
  Cat,
  Bird,
  Fish,
  Rabbit,
  Bug,
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

export function StorefrontHeader({
  user,
  userRole,
  categories,
  petTypes,
  brands,
}: {
  user: User | null;
  userRole: string | null;
  categories: Array<{ id: string; name: string; slug: string | null; parent_id?: string | null }>;
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

  // Which main departments to show in the top nav
  const primaryNavNames = [
    "Dog", 
    "Cat", 
    "Farm Animal Department", 
    "Lawn & Garden Department", 
    "Wild Bird", 
    "Small Pet"
  ];
  
  const primaryNavCategories = primaryNavNames
    .map(name => topLevel.find(c => c.name === name))
    .filter(Boolean) as typeof categories;

  return (
    <>
      <header className="max-md:hidden sticky top-0 z-50 w-full flex flex-col shadow-sm">
        {/* Tier 1: Pre-Header */}
        <div className="bg-zinc-100 py-1.5 px-4 text-xs font-semibold tracking-wide text-zinc-900 flex justify-between items-center border-b border-zinc-200">
          <div className="container mx-auto flex justify-between items-center">
            <div className="uppercase">
              From big to small, we feed them all!
            </div>
            <div className="flex gap-4">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Tier 2: Main Header Logo & Actions */}
        <div className="bg-primary text-white border-b border-primary-foreground/10">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="h-16 w-16 relative bg-transparent rounded-sm p-1">
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
                <span className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-sm">
                  Bay State
                </span>
                <span className="hidden sm:text-sm font-bold sm:inline leading-none text-white/90 uppercase tracking-wider">
                  Pet & Garden Supply
                </span>
              </div>
            </Link>

            <div className="flex-1 max-w-lg mx-8 flex justify-end">
              <InlineSearch />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <UserMenu user={user} userRole={userRole} />
              <Button
                variant="ghost"
                size="icon"
                className="relative h-11 w-11 text-white hover:bg-white/20 hover:text-white"
                aria-label="Shopping cart"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md">
                  {itemCount}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Tier 3: Navigation Bar (Mega Menu) */}
        <div className="bg-zinc-900 text-white">
          <div className="container mx-auto flex h-12 items-center px-4">
            <NavigationMenu className="flex" aria-label="Main Navigation">
              <NavigationMenuList className="gap-1">
                
                {/* Dynamic Mega Menu for each primary department */}
                {primaryNavCategories.map(parent => {
                  const children = childrenMap.get(parent.id) || [];
                  if (children.length === 0) return null;

                  // Clean up name for display (e.g. "Farm Animal Department" -> "Farm Animal")
                  const displayName = parent.name.replace(" Department", "");

                  // Split into columns of 8
                  const chunkSize = 8;
                  const columns = [];
                  for (let i = 0; i < children.length; i += chunkSize) {
                    columns.push(children.slice(i, i + chunkSize));
                  }

                  return (
                    <NavigationMenuItem key={parent.id}>
                      <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 text-sm uppercase tracking-wider font-bold">
                        {displayName}
                      </NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="flex gap-8 p-6 w-max min-w-[400px] text-zinc-900 bg-white border shadow-lg rounded-b-md">
                          {columns.map((col, idx) => (
                            <div key={idx} className="flex flex-col gap-3 min-w-[180px]">
                              {/* Show header only on first column, mock others to align grid */}
                              {idx === 0 ? (
                                <h4 className="font-black text-lg mb-2 border-b-2 border-primary/20 pb-2 text-zinc-800 tracking-tight">
                                  {displayName}
                                </h4>
                              ) : (
                                <h4 className="font-black text-lg mb-2 border-b-2 border-transparent pb-2 text-transparent select-none">
                                  -
                                </h4>
                              )}
                              
                              {col.map(child => {
                                // Strip parent prefix for cleaner menu (e.g. "Dog Food" -> "Food")
                                const childDisplayName = child.name.startsWith(displayName + " ") 
                                  ? child.name.replace(displayName + " ", "") 
                                  : child.name;

                                return (
                                  <NavigationMenuLink key={child.id} asChild>
                                    <Link
                                      href={`/products?category=${child.slug}`}
                                      className="text-[14px] font-medium text-zinc-600 hover:text-primary hover:translate-x-1 transition-all"
                                    >
                                      {childDisplayName}
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
                  <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 text-sm uppercase tracking-wider font-bold">
                    Brands
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[600px] p-6 text-zinc-900 bg-white border shadow-lg rounded-b-md">
                      <h4 className="font-black text-lg mb-4 border-b-2 border-primary/20 pb-2 text-zinc-800 tracking-tight">
                        Top Brands
                      </h4>
                      <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                        {brands.slice(0, 15).map((brand) => (
                          <NavigationMenuLink key={brand.id} asChild>
                            <Link
                              href={`/products?brand=${brand.slug}`}
                              className="text-[14px] font-medium text-zinc-600 hover:text-primary hover:underline underline-offset-4 truncate"
                            >
                              {brand.name}
                            </Link>
                          </NavigationMenuLink>
                        ))}
                      </div>
                      <div className="mt-6 pt-4 border-t border-zinc-100 flex justify-end">
                        <NavigationMenuLink asChild>
                          <Link href="/brands" className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">
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
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-xs uppercase tracking-widest font-black text-zinc-400 transition-colors hover:text-white focus:text-white focus:outline-none"
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
      <header className="md:hidden sticky top-0 z-50 w-full border-b border-primary-foreground/10 bg-primary text-white shadow-sm flex h-16 items-center justify-between px-4">
        <MobileNavDrawer
          categories={categories}
          petTypes={petTypes}
          brands={brands}
          userRole={userRole}
        />
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-10 w-10 relative bg-transparent rounded p-0.5">
            <Image
              src="/logo.png"
              alt="Bay State Logo"
              fill
              sizes="40px"
              className="object-contain"
            />
          </div>
          <span className="font-bold text-white tracking-tight">
            Bay State
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <InlineSearch />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-11 w-11 text-white hover:bg-white/20"
            aria-label="Shopping cart"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
              {itemCount}
            </span>
          </Button>
        </div>
      </header>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
