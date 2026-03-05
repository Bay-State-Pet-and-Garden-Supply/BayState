'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ShoppingBag, Package, Wrench, Info, User, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface MobileNavDrawerProps {
  categories: Array<{ id: string; name: string; slug: string | null }>;
  petTypes: Array<{ id: string; name: string; icon: string | null }>;
  brands: Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
  userRole: string | null;
}

const navItems = [
  { href: '/products', label: 'Products', icon: ShoppingBag },
  { href: '/brands', label: 'Brands', icon: Package },
  { href: '/services', label: 'Services', icon: Wrench },
  { href: '/about', label: 'About', icon: Info },
];

export function MobileNavDrawer({
  categories,
  petTypes,
  brands,
  userRole,
}: MobileNavDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-white hover:bg-white/20 hover:text-white md:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm p-0">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="text-lg font-bold">Menu</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col py-4" aria-label="Mobile navigation">
          {/* Main Navigation */}
          <div className="space-y-1 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Admin Link */}
          {(userRole === 'admin' || userRole === 'staff') && (
            <>
              <div className="my-2 border-t" />
              <div className="space-y-1 px-4">
                <Link
                  href="/admin"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium text-red-600 hover:bg-red-50"
                >
                  <User className="h-5 w-5" />
                  Admin Portal
                </Link>
              </div>
            </>
          )}

          {/* Categories Section */}
          {petTypes.length > 0 && (
            <>
              <div className="my-2 border-t" />
              <div className="px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Shop by Pet
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {petTypes.slice(0, 6).map((pet) => (
                    <Link
                      key={pet.id}
                      href={`/products?petTypeId=${pet.id}`}
                      onClick={() => setIsOpen(false)}
                      className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {pet.name}
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Quick Links */}
          <div className="mt-auto border-t pt-4">
            <div className="space-y-2 px-4">
              <Link
                href="/cart"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Shopping Cart
              </Link>
              <Link
                href="/account"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                My Account
              </Link>
            </div>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
