import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Official Brand Review | Pipeline | Admin | Bay State Pet & Garden",
  description: "Deprecated — Official Brand URL review has been replaced by Approved Source Extraction.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfficialBrandReviewPage() {
  return (
    <AdminPageShell
      title="Official brand review"
      description="Deprecated — Approved Source Extraction replaces this workflow."
      icon={<PackageSearch className="h-5 w-5" />}
      eyebrow="Deprecated workflow"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/pipeline">
            <ArrowLeft className="h-4 w-4" />
            Back to Pipeline
          </Link>
        </Button>
      }
    >
      <div className="rounded-none border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">
          This feature has been replaced
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The Official Brand URL review workflow has been replaced by
          {" "}<strong>Approved Source Extraction</strong>. Products are now
          enriched through approved sources (brand websites and distributor
          portals) directly — no URL review step needed.
        </p>
        <p className="mt-4">
          <Button asChild>
            <Link href="/admin/pipeline">Go to Pipeline</Link>
          </Button>
        </p>
      </div>
    </AdminPageShell>
  );
}
