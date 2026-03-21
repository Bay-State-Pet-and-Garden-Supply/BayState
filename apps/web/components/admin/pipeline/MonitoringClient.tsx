"use client";

import { Activity, Brain } from "lucide-react";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";

export function MonitoringClient() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Pipeline Scraping
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitor active scraper runs and AI consolidation batches in real time.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[#008850]/10 p-2">
              <Activity className="h-5 w-5 text-[#008850]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Active Runs
              </h2>
              <p className="text-sm text-gray-600">
                Live scraper jobs currently running or queued.
              </p>
            </div>
          </div>

          <ActiveRunsTab className="mt-4" />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Active Consolidations
              </h2>
              <p className="text-sm text-gray-600">
                Current AI consolidation batches and progress snapshots.
              </p>
            </div>
          </div>

          <ActiveConsolidationsTab className="mt-4" />
        </section>
      </div>
    </div>
  );
}
