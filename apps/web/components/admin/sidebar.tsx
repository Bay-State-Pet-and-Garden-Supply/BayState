"use client";

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { adminNavSections, isAdminNavItemActive } from './navigation';

const SIDEBAR_STORAGE_KEY = 'adminSidebarCollapsed';
const SIDEBAR_STORAGE_EVENT = 'admin-sidebar-storage';

function getCollapsedSnapshot(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

function subscribeToCollapsedState(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleChange = (event: Event) => {
    if (
      event instanceof StorageEvent &&
      event.key !== null &&
      event.key !== SIDEBAR_STORAGE_KEY
    ) {
      return;
    }

    onStoreChange();
  };

  window.addEventListener('storage', handleChange);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, handleChange);
  };
}

function setCollapsedPreference(value: boolean) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
  } catch {
    // ignore storage failures
  }
}

interface AdminSidebarProps {
  userRole?: 'admin' | 'staff' | 'customer';
  forceExpanded?: boolean;
}

export function AdminSidebar({ userRole = 'staff', forceExpanded = false }: AdminSidebarProps) {
  const pathname = usePathname();
  const storedCollapsed = useSyncExternalStore(
    subscribeToCollapsedState,
    getCollapsedSnapshot,
    () => false,
  );
  const collapsed = forceExpanded ? false : storedCollapsed;

  const toggleCollapsed = useCallback(() => {
    setCollapsedPreference(!collapsed);
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-white/12 bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out',
        collapsed ? 'w-[92px]' : 'w-[280px]',
      )}
    >
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
              <Image
                src="/icon.png"
                alt="Bay State app icon"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </div>

            {!collapsed ? (
              <div className="min-w-0 space-y-1">
                <h1 className="truncate text-sm font-semibold text-white">Bay State Admin</h1>
                <p className="truncate text-xs text-white/70">Calm tools for catalog, scraping, and storefront work.</p>
              </div>
            ) : null}
          </div>

          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              className="border-white/10 bg-white/6 text-white hover:bg-white/10 hover:text-white"
              aria-label="Collapse navigation"
              disabled={forceExpanded}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              className="border-white/10 bg-white/6 text-white hover:bg-white/10 hover:text-white"
              aria-label="Expand navigation"
              disabled={forceExpanded}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <nav className={cn('flex-1 space-y-6 overflow-y-auto py-5', collapsed ? 'px-3' : 'px-4')}>
        <TooltipProvider delayDuration={0}>
          {adminNavSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {!collapsed ? (
                <h2 className="px-3 text-[11px] font-medium text-white/58">{section.title}</h2>
              ) : (
                <div className="mx-2 h-px bg-white/10" />
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isAdminNavItemActive(pathname, item.href);

                  const content = (
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      className={cn(
                        'group flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-white/12 text-white'
                          : 'text-white/76 hover:bg-white/7 hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 transition-transform duration-150',
                          active ? 'text-white' : 'text-white/68 group-hover:text-white',
                        )}
                      />

                      {!collapsed ? (
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.label}</div>
                          {item.description ? (
                            <div className="truncate text-xs text-white/60">{item.description}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </Link>
                  );

                  if (!collapsed) {
                    return <div key={item.href}>{content}</div>;
                  }

                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={12} className="border border-border bg-card px-3 py-2 text-xs text-foreground shadow-[var(--shadow-md)]">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className={cn('flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-3', collapsed && 'justify-center px-0')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sidebar">
            <ShieldCheck className="h-4 w-4" />
          </div>

          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">All staff access</p>
              <p className="truncate text-xs text-white/64">Signed in as {userRole}</p>
            </div>
          ) : null}
        </div>

        {!collapsed ? (
          <Link
            href="/"
            className="mt-3 inline-flex text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            Return to storefront
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
