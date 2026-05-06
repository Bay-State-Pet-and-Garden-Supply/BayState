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
 BarChart3,
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
 {
 href: "/admin/analytics",
 label: "Analytics",
 icon: BarChart3,
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
 "relative z-50 flex h-full flex-col border-r border-white/12 bg-brand-forest-green text-white transition-all duration-300 ease-in-out",
 collapsed ? "w-[80px]" : "w-[240px]",
 )}
 >
 {/* Header */}
 <div className="mb-2 flex h-20 items-center border-b border-white/10 bg-brand-forest-green px-4">
 <div
 className={cn(
 "flex items-center gap-2.5 transition-opacity duration-300",
 collapsed
 ? "opacity-0 invisible w-0"
 : "opacity-100 visible w-full",
 )}
 >
 <div className="shrink-0 rounded-xl bg-card/12 p-2 ring-1 ring-white/15 backdrop-blur-sm">
 <Image
 src="/icon.png"
 alt="Bay State app icon"
 width={20}
 height={20}
 className="h-5 w-5 object-contain"
 />
 </div>
 <div className="min-w-0">
 <h1 className="truncate text-sm font-semibold leading-tight text-white">
 Bay State
 </h1>
 <p className="truncate text-[11px] font-medium text-white/72">
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
 "absolute -right-4 top-1/2 z-50 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-card text-brand-forest-green shadow-[var(--shadow-md)] transition-colors duration-150 hover:bg-card/90 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-forest-green",
 collapsed && "right-[-16px]",
 )}
 aria-label={collapsed ? "Expand" : "Collapse"}
 >
 {collapsed ? (
 <ChevronRight className="h-4 w-4" />
 ) : (
 <ChevronLeft className="h-4 w-4" />
 )}
 </button>
 </div>

 {/* Navigation */}
 <nav
 className={cn(
 "flex-1 space-y-6 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent py-4",
 collapsed ? "px-4" : "px-4",
 )}
 >
 <TooltipProvider delayDuration={0}>
 {visibleSections.map((section) => (
 <div
 key={section.title ?? section.items[0]?.href ?? "section"}
 className="space-y-2"
 >
 {section.title && !collapsed && (
 <h2 className="truncate px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-white/55">
 {section.title}
 </h2>
 )}
 {section.title && collapsed && (
 <div className="h-0.5 bg-card/10 mx-2 my-4" />
 )}

 <div className="space-y-1">
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
 "group relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
 collapsed ? "justify-center" : "gap-2.5",
 isActive
 ? "bg-card text-brand-forest-green shadow-[var(--shadow-sm)]"
 : "text-white/78 hover:bg-card/12 hover:text-white",
 )}
 >
 <Icon
 className={cn(
 "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
 isActive
 ? "text-brand-forest-green"
 : "text-white/60 group-hover:text-white",
 )}
 />
 {!collapsed && (
 <span className="truncate font-medium">
 {item.label}
 </span>
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
 className="border border-white/20 bg-card px-4 py-2 text-xs font-medium text-brand-forest-green shadow-[var(--shadow-md)]"
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
 <div className="mt-auto border-t border-white/10 bg-black/8 p-3 backdrop-blur-sm">
 <div
 className={cn(
 "flex items-center",
 collapsed ? "justify-center" : "gap-2.5 px-1",
 )}
 >
 <div className="relative shrink-0">
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-brand-forest-green ring-1 ring-white/10">
 <User className="h-5 w-5 text-brand-forest-green" />
 </div>
 </div>

 {!collapsed && (
 <div className="flex-1 min-w-0">
 <p className="truncate text-xs font-semibold leading-tight text-white">
 Staff Account
 </p>
 <div className="flex items-center gap-1 mt-0.5">
 <ShieldCheck
 className={cn(
 "h-2.5 w-2.5",
 isAdmin ? "text-brand-gold" : "text-white/60",
 )}
 />
 <span
 className={cn(
 "truncate text-[11px] font-medium",
 isAdmin ? "text-brand-gold" : "text-white/60",
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
 "mt-3 flex flex-col gap-1",
 collapsed ? "items-center" : "",
 )}
 >
 <Link
 href="/"
 className={cn(
 "flex items-center rounded-xl px-2.5 py-2 text-[11px] font-medium text-white/70 transition-all hover:bg-card/10 hover:text-white",
 collapsed ? "justify-center" : "gap-2.5",
 )}
 >
 <LogOut className="h-4 w-4 rotate-180" />
 {!collapsed && <span className="truncate">Exit Portal</span>}
 </Link>
 </div>
 </div>
 </aside>
 );
}
