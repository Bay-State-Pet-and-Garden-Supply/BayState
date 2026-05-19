'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface MobileSidebarDrawerProps {
  children: React.ReactNode;
}

export function MobileSidebarDrawer({ children }: MobileSidebarDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      queueMicrotask(() => setOpen(false));
    }
  }, [pathname]);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-50 gap-2 border-border bg-card/96 px-3 text-foreground shadow-[var(--shadow-sm)] backdrop-blur md:hidden"
        aria-label="Open admin navigation"
      >
        <Menu className="h-4 w-4" />
        Menu
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[280px] border-r border-border bg-card p-0 shadow-[var(--shadow-float)]"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
