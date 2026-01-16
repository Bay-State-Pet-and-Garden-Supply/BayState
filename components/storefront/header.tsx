'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, ShoppingCart, Dog, Cat, Bird, Fish, Rabbit, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineSearch } from '@/components/storefront/inline-search';
import { useCartStore } from '@/lib/cart-store';
import { CartDrawer } from '@/components/storefront/cart-drawer';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';

import { User } from '@supabase/supabase-js';
import { UserMenu } from '@/components/auth/user-menu';

/**
 * StorefrontHeader - Main navigation header for the customer-facing storefront.
 * Features mobile-first design with 44px+ touch targets.
 */
const petTypeIcons: Record<string, React.ElementType> = {
  'Dog': Dog,
  'Cat': Cat,
  'Bird': Bird,
  'Fish': Fish,
  'Small Animal': Rabbit,
  'Reptile': Bug,
};

export function StorefrontHeader({
  user,
  userRole,
  categories,
  petTypes,
  brands
}: {
  user: User | null;
  userRole: string | null;
  categories: Array<{ id: string; name: string; slug: string | null }>;
  petTypes: Array<{ id: string; name: string; icon: string | null }>;
  brands: Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
}) {
  const itemCount = useCartStore((state) => state.getItemCount());
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <header className="max-md:hidden sticky top-0 z-50 w-full border-b border-white/10 bg-[#006640] text-white shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="h-14 w-14 relative">
              <Image
                src="/logo.png"
                alt="Bay State Pet & Garden Supply Logo"
                fill
                sizes="56px"
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-tight tracking-tight text-white">
                Bay State
              </span>
              <span className="hidden sm:text-lg font-bold sm:inline leading-none text-white">
                Pet & Garden Supply
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList className="gap-2">
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/20 hover:text-white data-[state=open]:bg-white/20">
                  Products
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-zinc-700">Shop by Pet</h4>
                      <ul className="space-y-1">
                        {petTypes.map((pet) => {
                          const IconComponent = petTypeIcons[pet.name] || Dog;
                          return (
                            <li key={pet.id}>
                              <NavigationMenuLink asChild>
                                <Link
                                  href={`/products?pet=${pet.name.toLowerCase()}`}
                                  className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                                >
                                  <span className="flex items-center gap-2">
                                    <IconComponent className="h-4 w-4" />
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
                      <h4 className="mb-2 text-sm font-semibold text-zinc-700">Categories</h4>
                      <ul className="space-y-1">
                        {categories.slice(0, 8).map((cat) => (
                          <li key={cat.id}>
                            <NavigationMenuLink asChild>
                              <Link
                                href={`/products?category=${cat.slug || cat.name.toLowerCase()}`}
                                className="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                              >
                                {cat.name}
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="border-t p-3">
                    <NavigationMenuLink asChild>
                      <Link href="/products" className="block text-center text-sm font-medium text-primary hover:underline">
                        View All Products
                      </Link>
                    </NavigationMenuLink>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-white/90 hover:bg-white/20 hover:text-white data-[state=open]:bg-white/20">
                  Brands
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[400px] p-4">
                    <h4 className="mb-3 text-sm font-semibold text-zinc-700">Popular Brands</h4>
                    <ul className="grid grid-cols-2 gap-2">
                      {brands.slice(0, 8).map((brand) => (
                        <li key={brand.id}>
                          <NavigationMenuLink asChild>
                            <Link
                              href={`/products?brand=${brand.slug}`}
                              className="flex items-center gap-2 rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            >
                              {brand.logo_url && (
                                <Image src={brand.logo_url} alt={brand.name} width={20} height={20} className="rounded" />
                              )}
                              {brand.name}
                            </Link>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 border-t pt-3">
                      <NavigationMenuLink asChild>
                        <Link href="/brands" className="block text-center text-sm font-medium text-primary hover:underline">
                          View All Brands
                        </Link>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link href="/services" className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/20 hover:text-white focus:bg-white/20 focus:text-white focus:outline-none">
                    Services
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link href="/about" className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/20 hover:text-white focus:bg-white/20 focus:text-white focus:outline-none">
                    About
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {(userRole === 'admin' || userRole === 'staff') && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link href="/admin" className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-white/20 hover:text-white focus:bg-white/20 focus:text-white focus:outline-none">
                      Admin
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Action Buttons - 44px+ touch targets */}
          <div className="flex items-center gap-2">
            <InlineSearch />
            <Button
              variant="ghost"
              size="icon"
              className="relative h-11 w-11 text-white hover:bg-white/20 hover:text-white"
              aria-label="Shopping cart"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-medium text-white ring-2 ring-white">
                {itemCount}
              </span>
            </Button>

            {/* User Menu */}
            <UserMenu user={user} />

            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-white hover:bg-white/20 hover:text-white md:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
