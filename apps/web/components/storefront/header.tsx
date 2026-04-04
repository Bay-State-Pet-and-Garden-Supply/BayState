"use client";

import { useState } from "react";
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

/**
 * StorefrontHeader - Main navigation header for the customer-facing storefront.
 * Features a 3-tier desktop layout (Pre-header, Main, Nav) to match the brand.
 */
const petTypeIcons: Record<string, React.ElementType> = {
  Dog: Dog,
  Cat: Cat,
  Bird: Bird,
  Fish: Fish,
  "Small Animal": Rabbit,
  Reptile: Bug,
};

export function StorefrontHeader({
  user,
  userRole,
  categories,
  petTypes,
  brands,
}: {
  user: User | null;
  userRole: string | null;
  categories: Array<{ id: string; name: string; slug: string | null }>;
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

        {/* Tier 2: Main Header Logo & Actions (Forest Green) */}
        <div className="bg-primary text-white border-b border-primary-foreground/10">
          <div className="container mx-auto flex h-20 items-center justify-between px-4">
            {/* Left: Logo */}
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

            {/* Center: Search (Modern InlineSearch) */}
            <div className="flex-1 max-w-lg mx-8 flex justify-end">
              <InlineSearch />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <UserMenu user={user} />
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

        {/* Tier 3: Navigation Bar (Dark Gray) */}
        <div className="bg-zinc-800 text-white">
          <div className="container mx-auto flex h-14 items-center px-4">
            <NavigationMenu className="flex" aria-label="Main">
              <NavigationMenuList className="gap-2">
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 text-sm uppercase tracking-wide font-semibold">
                    Shop Pet Supplies
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-zinc-700">
                          Shop by Pet
                        </h4>
                        <ul className="space-y-1">
                          {petTypes.map((pet) => {
                            const IconComponent = petTypeIcons[pet.name] || Dog;
                            return (
                              <li key={pet.id}>
                                <NavigationMenuLink asChild>
                                  <Link
                                    href={`/products?petTypeId=${pet.id}`}
                                    className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 hover:underline underline-offset-4"
                                  >
                                    <span className="flex items-center gap-2">
                                      <IconComponent className="h-4 w-4 text-zinc-600" />
                                      {pet.name}
                                    </span>
                                  </Link>
                                </NavigationMenuLink>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-zinc-700">
                          Categories
                        </h4>
                        <ul className="space-y-1">
                          {categories
                            .filter(
                              (c) =>
                                c.slug !== "farm" &&
                                c.slug !== "lawn-garden" &&
                                c.slug !== "home" &&
                                c.slug !== "seasonal",
                            )
                            .slice(0, 8)
                            .map((cat) => (
                              <li key={cat.id}>
                                <NavigationMenuLink asChild>
                                  <Link
                                    href={`/products?category=${cat.slug || cat.name.toLowerCase()}`}
                                    className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 hover:underline underline-offset-4"
                                  >
                                    {cat.name}
                                  </Link>
                                </NavigationMenuLink>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                    <div className="border-t border-zinc-100 p-3 bg-zinc-50 rounded-b-md">
                      <NavigationMenuLink asChild>
                        <Link
                          href="/products"
                          className="block text-center text-sm font-medium text-primary hover:underline underline-offset-4"
                        >
                          View All Pet Products
                        </Link>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 text-sm uppercase tracking-wide font-semibold">
                    Shop by Brand
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[400px] p-4">
                      <h4 className="mb-3 text-sm font-semibold text-zinc-700">
                        Popular Brands
                      </h4>
                      <ul className="grid grid-cols-2 gap-2">
                        {brands.slice(0, 8).map((brand) => (
                          <li key={brand.id}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={`/products?brand=${brand.slug}`}
                                className="flex items-center gap-2 rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900 hover:underline underline-offset-4"
                              >
                                {brand.logo_url && (
                                  <Image
                                    src={brand.logo_url}
                                    alt={brand.name}
                                    width={20}
                                    height={20}
                                    className="rounded object-contain"
                                  />
                                )}
                                {brand.name}
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 border-t border-zinc-100 pt-3 bg-zinc-50 -mx-4 -mb-4 px-4 pb-4 pt-3 rounded-b-md">
                        <NavigationMenuLink asChild>
                          <Link
                            href="/brands"
                            className="block text-center text-sm font-medium text-primary hover:underline underline-offset-4"
                          >
                            View All Brands
                          </Link>
                        </NavigationMenuLink>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {["Farm", "Lawn & Garden", "Home", "Seasonal"].map((label) => {
                  const slugMap: Record<string, string> = {
                    Farm: "farm",
                    "Lawn & Garden": "lawn-garden",
                    Home: "home",
                    Seasonal: "seasonal",
                  };
                  const exactMatch = categories.find(
                    (c) => c.slug === slugMap[label],
                  );
                  const href = exactMatch
                    ? `/products?category=${exactMatch.slug}`
                    : "/products";
                  return (
                    <NavigationMenuItem key={label}>
                      <NavigationMenuLink asChild>
                        <Link
                          href={href}
                          className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm uppercase tracking-wide font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none hover:underline underline-offset-4"
                        >
                          Shop {label}
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  );
                })}

                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/services"
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm uppercase tracking-wide font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none hover:underline underline-offset-4"
                    >
                      Services
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                {(userRole === "admin" || userRole === "staff") && (
                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        href="/admin"
                        className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm uppercase tracking-wide font-semibold text-red-300 transition-colors hover:bg-white/10 hover:text-red-200 focus:bg-white/10 focus:text-red-200 focus:outline-none hover:underline underline-offset-4"
                      >
                        Admin
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>

            {/* Mobile Nav toggle for mobile layout is integrated in MobileNavDrawer, but Header is hidden on max-md */}
          </div>
        </div>
      </header>

      {/* Mobile Header */}
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
            Bay State Pet & Garden
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
