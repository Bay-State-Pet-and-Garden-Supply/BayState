import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Boxes,
  Brush,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  Package,
  PanelsTopLeft,
  Rocket,
  Settings,
  ShoppingBasket,
  Sparkles,
  SquareStack,
  Tags,
  Truck,
  Users,
  UserRound,
  Workflow,
  Wrench,
  History,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  adminOnly?: boolean;
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
  adminOnly?: boolean;
}

export const adminNavSections: AdminNavSection[] = [
  {
    title: 'Operations',
    items: [
      {
        href: '/admin',
        label: 'Dashboard',
        icon: LayoutDashboard,
        description: 'Overview and alerts',
      },
      {
        href: '/admin/pipeline',
        label: 'Pipeline',
        icon: Workflow,
        description: 'Imports, review, publishing',
      },
      {
        href: '/admin/pipeline/history',
        label: 'Publish history',
        icon: History,
        description: 'Products published by day',
      },
      {
        href: '/admin/pipeline/runners',
        label: 'Runner health',
        icon: Rocket,
        description: 'Scraper runners and live status',
      },
      {
        href: '/admin/quality',
        label: 'Quality review',
        icon: ClipboardList,
        description: 'Exceptions and flagged items',
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        icon: Truck,
        description: 'Pickup and local delivery',
      },
    ],
  },
  {
    title: 'Catalog',
    items: [
      {
        href: '/admin/products',
        label: 'Products',
        icon: Package,
        description: 'Storefront catalog',
      },
      {
        href: '/admin/product-groups',
        label: 'Product groups',
        icon: Boxes,
        description: 'Variant-like product groupings',
      },
      {
        href: '/admin/preorder-groups',
        label: 'Pre-order groups',
        icon: ShoppingBasket,
        description: 'Seasonal and minimum-order programs',
      },
      {
        href: '/admin/brands',
        label: 'Brands',
        icon: Tags,
        description: 'Brand records and assets',
      },
      {
        href: '/admin/categories',
        label: 'Categories',
        icon: LayoutGrid,
        description: 'Storefront taxonomy',
      },
      {
        href: '/admin/services',
        label: 'Services',
        icon: Wrench,
        description: 'Service listings and pricing',
      },
    ],
  },
  {
    title: 'Storefront',
    items: [
      {
        href: '/admin/pages',
        label: 'Pages',
        icon: PanelsTopLeft,
        description: 'Content pages and landing screens',
      },
      {
        href: '/admin/design',
        label: 'Design',
        icon: Brush,
        description: 'Homepage and promotional design',
      },
      {
        href: '/admin/promotions',
        label: 'Promotions',
        icon: Sparkles,
        description: 'Coupons, promos, campaigns',
      },
      {
        href: '/admin/reviews',
        label: 'Reviews',
        icon: ClipboardList,
        description: 'Customer review moderation',
      },
      {
        href: '/admin/customers',
        label: 'Customers',
        icon: UserRound,
        description: 'Customer records',
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: Settings,
        description: 'System and AI configuration',
      },
      {
        href: '/admin/users',
        label: 'Users',
        icon: Users,
        description: 'Staff access',
        adminOnly: true,
      },
      {
        href: '/admin/b2b',
        label: 'B2B feeds',
        icon: Building2,
        description: 'Distributor and sync setup',
      },
      {
        href: '/admin/migration',
        label: 'Migration',
        icon: SquareStack,
        description: 'ShopSite and import tools',
      },
      {
        href: '/admin/analytics',
        label: 'Reporting',
        icon: BarChart3,
        description: 'Business reporting',
      },
    ],
  },
];

export function isAdminNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
