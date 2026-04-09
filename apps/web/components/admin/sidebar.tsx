"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import {
  Home,
  Settings,
  LogOut,
  Network,
  Activity,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  User,
  ShieldCheck,
  Package,
  DollarSign,
  GitBranch,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const navSections: NavSection[] = [
  {
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: Home,
      },
    ],
  },
  {
    title: "Storefront",
    items: [
      {
        href: "/admin/products",
        label: "Products",
        icon: Package,
      },
      {
        href: "/admin/product-lines",
        label: "Product Lines",
        icon: GitBranch,
      },
    ],
  },
  {
    title: "Pipeline",
    adminOnly: true,
    items: [
      {
        href: "/admin/pipeline",
        label: "Pipeline",
        icon: LayoutGrid,
        adminOnly: true,
      },
    ],
  },
  {
    title: "Scrapers",
    adminOnly: true,
    items: [
      {
        href: "/admin/scrapers/list",
        label: "Scrapers",
        icon: Activity,
        adminOnly: true,
      },
      {
        href: "/admin/scrapers/runs",
        label: "Runs",
        icon: LayoutGrid,
        adminOnly: true,
      },
      {
        href: "/admin/scrapers/network",
        label: "Network",
        icon: Network,
        adminOnly: true,
      },
    ],
  },
  {
    title: "System",
    adminOnly: true,
    items: [
      {
        href: "/admin/costs",
        label: "Costs",
        icon: DollarSign,
        adminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        adminOnly: true,
      },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "adminSidebarCollapsed";
const SIDEBAR_STORAGE_EVENT = "admin-sidebar-storage";

function getCollapsedSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function subscribeToCollapsedState(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
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
  window.addEventListener("storage", handleChange);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, handleChange);
  };
}

function setCollapsedPreference(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
  } catch {
    /* ignore */
  }
}

interface AdminSidebarProps {
  userRole?: "admin" | "staff" | "customer";
}

export function AdminSidebar({ userRole = "staff" }: AdminSidebarProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "admin";
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedState,
    getCollapsedSnapshot,
    () => true,
  );

  const visibleSections = navSections
    .filter((section) => !section.adminOnly || isAdmin)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((section) => section.items.length > 0);

  const toggleCollapsed = useCallback(() => {
    setCollapsedPreference(!collapsed);
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out border-r border-sidebar-border/20 shadow-xl z-50",
        collapsed ? "w-[80px]" : "w-[200px]",
      )}
    >
      {/* Header */}
      <div className="flex h-20 items-center px-4 mb-2">
        <div
          className={cn(
            "flex items-center gap-2.5 transition-opacity duration-300",
            collapsed
              ? "opacity-0 invisible w-0"
              : "opacity-100 visible w-full",
          )}
        >
          <div className="bg-card/10 p-1.5 rounded-lg shadow-inner border border-white/20 shrink-0">
            <Image
              src="/icon.png"
              alt="Bay State app icon"
              width={20}
              height={20}
              className="h-5 w-5 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight truncate">
              Bay State
            </h1>
            <p className="text-[9px] font-medium uppercase tracking-wider text-white/50 truncate">
              Admin Control
            </p>
          </div>
        </div>

        {collapsed && (
          <div className="absolute inset-x-0 top-0 flex justify-center py-6">
            <Image
              src="/icon.png"
              alt="Bay State app icon"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </div>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-sidebar border border-sidebar-border/30 text-sidebar-foreground shadow-lg hover:scale-110 transition-transform active:scale-95 cursor-pointer",
            collapsed && "right-[-12px]",
          )}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 space-y-6 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-4",
          collapsed ? "px-4" : "px-4",
        )}
      >
        <TooltipProvider delayDuration={0}>
          {visibleSections.map((section) => (
            <div key={section.title ?? section.items[0]?.href ?? "section"} className="space-y-1.5">
              {section.title && !collapsed && (
                <h2 className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40 truncate">
                  {section.title}
                </h2>
              )}
              {section.title && collapsed && (
                <div className="h-px bg-card/10 mx-2 my-4" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin" && pathname.startsWith(item.href));

                  const content = (
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      className={cn(
                        "group relative flex items-center rounded-lg px-3 py-2 transition-all duration-200",
                        collapsed ? "justify-center" : "gap-2.5",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_4px_12px_rgba(0,0,0,0.15)] ring-1 ring-white/20 font-bold"
                          : "text-white/70 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                          isActive
                            ? "text-accent"
                            : "text-white/60 group-hover:text-white",
                        )}
                      />
                      {!collapsed && (
                        <span className="text-xs font-medium tracking-wide truncate">
                          {item.label}
                        </span>
                      )}
                      {isActive && !collapsed && (
                        <div className="absolute right-2 h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_var(--sidebar-accent-foreground)]" />
                      )}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{content}</TooltipTrigger>
                        <TooltipContent
                          side="right"
                          sideOffset={20}
                          className="bg-sidebar-accent border-sidebar-border/30 text-sidebar-accent-foreground font-medium px-4 py-2 text-xs shadow-xl"
                        >
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{content}</div>;
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      {/* Footer / User Profile */}
      <div className="mt-auto p-3 border-t border-white/10 bg-black/5">
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "gap-2.5 px-1",
          )}
        >
          <div className="relative shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center border border-white/20 shadow-lg">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-brand-forest-green border-2 border-sidebar flex items-center justify-center">
              <div className="h-1 w-1 rounded-full bg-card animate-pulse" />
            </div>
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                Staff Account
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck
                  className={cn(
                    "h-2.5 w-2.5",
                    isAdmin ? "text-accent" : "text-white/40",
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wider truncate",
                    isAdmin ? "text-accent" : "text-white/40",
                  )}
                >
                  {userRole}
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          className={cn(
            "mt-3 flex flex-col gap-0.5",
            collapsed ? "items-center" : "",
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-red-500/10 hover:text-red-400",
              collapsed ? "justify-center" : "gap-2.5",
            )}
          >
            <LogOut className="h-3.5 w-3.5 rotate-180" />
            {!collapsed && <span className="truncate">Exit Portal</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}
