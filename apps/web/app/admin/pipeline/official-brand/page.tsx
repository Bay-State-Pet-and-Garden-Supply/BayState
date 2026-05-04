import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { OfficialBrandReviewClient } from "@/components/admin/pipeline/OfficialBrandReviewClient";
import { Button } from "@/components/ui/button";
import { loadOfficialBrandCandidates } from "@/lib/official-brand-review";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Official Brand Review | Pipeline | Admin | Bay State Pet & Garden",
  description: "Review discovered Official Brand URL candidates before extraction.",
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function getStringParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function BackAction() {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href="/admin/pipeline">
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </Link>
    </Button>
  );
}

export default async function OfficialBrandReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cohortId = getStringParam(params.cohort_id);
  const discoveryJobId = getStringParam(params.discovery_job_id);

  if (!cohortId) {
    return (
      <AdminPageShell
        title="Official Brand Review"
        description="Choose one product page URL per SKU before extraction."
        icon={<PackageSearch className="h-5 w-5" />}
        actions={<BackAction />}
        compactHeader
      >
        <div className="rounded-none border border-border bg-card p-6">
          <h2 className="text-lg font-black uppercase tracking-tighter text-foreground">
            Missing Cohort
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a cohort_id query parameter to open the candidate review workspace.
          </p>
        </div>
      </AdminPageShell>
    );
  }

  try {
    const supabase = await createClient();
    const initialData = await loadOfficialBrandCandidates(supabase, {
      cohortId,
      ...(discoveryJobId ? { discoveryJobId } : {}),
    });

    return (
      <AdminPageShell
        title="Official Brand Review"
        description="Choose one product page URL per SKU before extraction."
        icon={<PackageSearch className="h-5 w-5" />}
        actions={<BackAction />}
        fullHeight
        compactHeader
      >
        <OfficialBrandReviewClient
          initialData={initialData}
          discoveryJobId={discoveryJobId}
        />
      </AdminPageShell>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load candidates";
    return (
      <AdminPageShell
        title="Official Brand Review"
        description="Choose one product page URL per SKU before extraction."
        icon={<PackageSearch className="h-5 w-5" />}
        actions={<BackAction />}
        compactHeader
      >
        <div className="rounded-none border border-brand-burgundy bg-brand-burgundy/5 p-6">
          <h2 className="text-lg font-black uppercase tracking-tighter text-brand-burgundy">
            Could Not Load Candidates
          </h2>
          <p className="mt-1 text-sm text-foreground">{message}</p>
        </div>
      </AdminPageShell>
    );
  }
}
