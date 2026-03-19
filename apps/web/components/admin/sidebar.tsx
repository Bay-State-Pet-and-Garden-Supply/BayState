"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Settings,
  RefreshCw,
  LogOut,
  Network,
  Activity,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean; // If true, only show for admin role
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean; // If true, entire section is admin-only
}

const navSections: NavSection[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: <Home className="h-5 w-5" /> },
    ],
  },
  {
    title: "Pipeline",
    adminOnly: true,
    items: [
      {
        href: "/admin/pipeline",
        label: "Overview",
        icon: <LayoutGrid className="h-5 w-5" />,
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
        icon: <Activity className="h-5 w-5" />,
        adminOnly: true,
      },
      {
        href: "/admin/scrapers/network",
        label: "Network",
        icon: <Network className="h-5 w-5" />,
        adminOnly: true,
      },
    ],
  },
  {
    title: "System",
    adminOnly: true,
    items: [
      {
        href: "/admin/migration",
        label: "Data Migration",
        icon: <RefreshCw className="h-5 w-5" />,
        adminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: <Settings className="h-5 w-5" />,
        adminOnly: true,
      },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "adminSidebarCollapsed";

interface AdminSidebarProps {
  userRole?: "admin" | "staff" | "customer";
}

export function AdminSidebar({ userRole = "staff" }: AdminSidebarProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "admin";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const visibleSections = navSections
    .filter((section) => !section.adminOnly || isAdmin)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((section) => section.items.length > 0);

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
        <h1 className={cn("text-xl font-bold", collapsed && "sr-only")}>
          Manager Portal
        </h1>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav
        className={cn(
          "flex-1 space-y-6 overflow-y-auto",
          collapsed ? "px-2" : "p-4",
        )}
        aria-label="Admin"
      >
        {visibleSections.map((section, idx) => (
          <div key={idx}>
            {section.title && (
              <h2
                className={cn(
                  "mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70",
                  collapsed && "sr-only",
                )}
              >
                {section.title}
              </h2>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                // For dashboard root routes like /admin/scrapers, only match exact paths
                // to avoid highlighting when on child routes like /admin/scrapers/network
                const isDashboardRoot = item.href === "/admin/scrapers";
                const isActive = pathname
                  ? isDashboardRoot
                    ? pathname === item.href ||
                      pathname === item.href + "/dashboard"
                    : pathname === item.href ||
                      (item.href !== "/admin" &&
                        pathname.startsWith(item.href + "/"))
                  : false;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-3 rounded px-4 py-2 transition-colors",
                      collapsed && "justify-center px-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-center justify-center"
                    >
                      {item.icon}
                    </span>
                    <span className={collapsed ? "sr-only" : ""}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: Role & Exit */}
      <div
        className={cn(
          "border-t border-sidebar-border p-4",
          collapsed && "px-2",
        )}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className={cn(
              "flex items-center space-x-2 text-sm text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground",
              collapsed && "justify-center",
            )}
          >
            <LogOut className="h-4 w-4 rotate-180" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : ""}>Exit</span>
          </Link>

          <div className="flex items-center space-x-2 text-xs">
            <span
              className={cn(
                "text-sidebar-foreground/50",
                collapsed && "sr-only",
              )}
            >
              Role:
            </span>
            <span
              title={userRole}
              className={cn(
                "px-2 py-0.5 rounded",
                isAdmin
                  ? "bg-purple-900/50 text-purple-300"
                  : "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              {collapsed ? userRole.charAt(0).toUpperCase() : userRole}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
