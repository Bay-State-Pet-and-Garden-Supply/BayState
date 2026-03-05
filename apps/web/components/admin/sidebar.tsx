'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Settings,
  PackagePlus,
  RefreshCw,
  LogOut,
  Network,
  FileCode2,
  History,
  Activity,
  LayoutGrid,
  Wrench,
} from 'lucide-react';

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
      { href: '/admin', label: 'Overview', icon: <Home className="h-5 w-5" /> },
    ],
  },
  {
    title: 'Pipeline',
    adminOnly: true,
    items: [
      { href: '/admin/pipeline', label: 'Overview', icon: <LayoutGrid className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/pipeline/monitoring', label: 'Monitoring', icon: <Activity className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/pipeline/tools', label: 'Tools', icon: <Wrench className="h-5 w-5" />, adminOnly: true },
    ],
  },
  {
    title: 'Scrapers',
    adminOnly: true,
    items: [
      { href: '/admin/scrapers/list', label: 'Scrapers', icon: <Activity className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/scrapers/network', label: 'Network', icon: <Network className="h-5 w-5" />, adminOnly: true },
    ],
  },
  {
    title: 'System',
    adminOnly: true,
    items: [
      { href: '/admin/migration', label: 'Data Migration', icon: <RefreshCw className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, adminOnly: true },
    ],
  },
];

interface AdminSidebarProps {
  userRole?: 'admin' | 'staff' | 'customer';
}

export function AdminSidebar({ userRole = 'staff' }: AdminSidebarProps) {
  const pathname = usePathname();
  const isAdmin = userRole === 'admin';

  // Filter sections and items based on role
  const visibleSections = navSections
    .filter(section => !section.adminOnly || isAdmin)
    .map(section => ({
      ...section,
      items: section.items.filter(item => !item.adminOnly || isAdmin)
    }))
    .filter(section => section.items.length > 0);

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
        <h1 className="text-xl font-bold">Manager Portal</h1>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-4" aria-label="Admin">
        {visibleSections.map((section, idx) => (
          <div key={idx}>
            {section.title && (
              <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                {section.title}
              </h2>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                // For dashboard root routes like /admin/scrapers, only match exact paths
                // to avoid highlighting when on child routes like /admin/scrapers/network
                const isDashboardRoot = item.href === '/admin/scrapers';
                const isActive = pathname
                  ? isDashboardRoot
                    ? pathname === item.href || pathname === item.href + '/dashboard'
                    : pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                  : false;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-3 rounded px-4 py-2 transition-colors ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: Role & Exit */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center space-x-2 text-sm text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 rotate-180" />
            <span>Exit</span>
          </Link>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-sidebar-foreground/50">Role:</span>
            <span className={`px-2 py-0.5 rounded ${isAdmin ? 'bg-purple-900/50 text-purple-300' : 'bg-sidebar-accent text-sidebar-accent-foreground'}`}>
              {userRole}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
