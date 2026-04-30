"use client";

import { Activity, Brain } from "lucide-react";
import {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
} from "@/components/admin/admin-card";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";

export function MonitoringClient() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <AdminCard variant="panel">
        <AdminCardHeader>
          <div className="rounded-lg bg-primary/10 p-2">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <AdminCardTitle>Active Runs</AdminCardTitle>
            <AdminCardDescription>
              Live scraper jobs currently running or queued.
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <ActiveRunsTab />
        </AdminCardContent>
      </AdminCard>

      <AdminCard variant="panel">
        <AdminCardHeader>
          <div className="rounded-lg bg-brand-burgundy/10 p-2">
            <Brain className="h-5 w-5 text-brand-burgundy" />
          </div>
          <div>
            <AdminCardTitle>Active Consolidations</AdminCardTitle>
            <AdminCardDescription>
              Current AI consolidation batches and progress snapshots.
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <ActiveConsolidationsTab />
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}
