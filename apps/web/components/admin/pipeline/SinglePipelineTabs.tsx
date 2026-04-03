"use client";

import { type CSSProperties } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Inbox, Loader2, CheckCircle2, Sparkles, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SinglePipelineTabs - A 5-tab pipeline workflow component.
 * 
 * Displays the pipeline workflow as a single tab group with 5 stages:
 * Imported → Scraping → Scraped → Consolidating → Finalizing
 * 
 * Uses Forest Green (#008850) for active states and supports responsive design.
 */

export interface SinglePipelineTabsProps {
  /** Currently active tab */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (tab: string) => void;
  /** Count of products in each tab */
  counts: Record<string, number>;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}

const TABS: TabConfig[] = [
  {
    id: "imported",
    label: "Imported",
    icon: Inbox,
    description: "Products imported into ingestion and waiting for scraping",
    color: "#6B7280",
  },
  {
    id: "scraping",
    label: "Scraping",
    icon: Loader2,
    description: "Products currently being scraped",
    color: "#3B82F6",
  },
  {
    id: "scraped",
    label: "Scraped",
    icon: CheckCircle2,
    description: "Products with completed scrape results ready for consolidation",
    color: "#8B5CF6",
  },
  {
    id: "consolidating",
    label: "Consolidating",
    icon: Sparkles,
    description: "AI consolidation in progress",
    color: "#EC4899",
  },
  {
    id: "finalizing",
    label: "Finalizing",
    icon: Flag,
    description: "Products ready for final review",
    color: "#008850",
  },
];

export default function SinglePipelineTabs({
  activeTab,
  onTabChange,
  counts,
}: SinglePipelineTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value)}
      className="w-full"
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1 sm:p-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.id] ?? 0;
          const isActive = activeTab === tab.id;

          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all",
                "data-[state=active]:shadow-sm",
                "data-[state=active]:bg-background",
                "data-[state=active]:text-foreground",
                "hover:bg-background/50",
                "rounded-md"
              )}
              style={
                {
                  "--tab-color": isActive ? tab.color : undefined,
                } as CSSProperties
              }
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive && "text-[var(--tab-color)]"
                )}
              />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={cn(
                  "ml-1",
                  isActive && "bg-[var(--tab-color)] hover:bg-[var(--tab-color)]/90"
                )}
              >
                {count}
              </Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}