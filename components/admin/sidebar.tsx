import Link from 'next/link';
import {
  Package,
  Wrench,
  ShoppingCart,
  Home,
  Settings,
  PackagePlus,
  BarChart3,
  Tag,
  Users,
  Palette,
  RefreshCw,
  LogOut,
  FolderTree,
  UserCircle,
  Percent,
  Network,
  FileCode2,
  Star,
  Beaker,
  Play,
  History,
  Server,
  Settings2,
  Layers,
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
    title: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', icon: <Package className="h-5 w-5" /> },
      { href: '/admin/categories', label: 'Categories', icon: <FolderTree className="h-5 w-5" /> },
      { href: '/admin/brands', label: 'Brands', icon: <Tag className="h-5 w-5" /> },
      { href: '/admin/services', label: 'Services', icon: <Wrench className="h-5 w-5" /> },
      { href: '/admin/pipeline', label: 'New Products', icon: <PackagePlus className="h-5 w-5" /> },
    ],
  },
  {
    title: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: <ShoppingCart className="h-5 w-5" /> },
      { href: '/admin/customers', label: 'Customers', icon: <UserCircle className="h-5 w-5" /> },
      { href: '/admin/promotions', label: 'Promotions', icon: <Percent className="h-5 w-5" /> },
      { href: '/admin/reviews', label: 'Reviews', icon: <Star className="h-5 w-5" /> },
    ],
  },
  {
    title: 'Reports',
    items: [
      { href: '/admin/analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" /> },
    ],
  },
  {
    title: 'Storefront',
    items: [
      { href: '/admin/design', label: 'Site Design', icon: <Palette className="h-5 w-5" /> },
    ],
  },
  {
    title: 'Scraper',
    adminOnly: true,
    items: [
      { href: '/admin/scrapers', label: 'Dashboard', icon: <BarChart3 className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/scrapers/configs', label: 'Configs', icon: <Layers className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/scrapers/test-lab', label: 'Test Lab', icon: <Beaker className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/scrapers/runs', label: 'Runs', icon: <History className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/scrapers/network', label: 'Network', icon: <Network className="h-5 w-5" />, adminOnly: true },
    ],
  },
  {
    title: 'System',
    adminOnly: true,
    items: [
      { href: '/admin/users', label: 'Users', icon: <Users className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/migration', label: 'Data Migration', icon: <RefreshCw className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/tools/integra-sync', label: 'Integra Sync', icon: <RefreshCw className="h-5 w-5" />, adminOnly: true },
      { href: '/admin/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, adminOnly: true },
    ],
  },
];

interface AdminSidebarProps {
  userRole?: 'admin' | 'staff' | 'customer';
}

export function AdminSidebar({ userRole = 'staff' }: AdminSidebarProps) {
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
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center space-x-3 rounded px-4 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
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
