'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

interface MobileSidebarDrawerProps {
  children: React.ReactNode;
}

export function MobileSidebarDrawer({ children }: MobileSidebarDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  // Close drawer on navigation
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      queueMicrotask(() => setOpen(false));
    }
  }, [pathname]);

  return (
    <>
      <Button
        variant="default"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-md)] md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[240px] border-r border-border bg-card p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
