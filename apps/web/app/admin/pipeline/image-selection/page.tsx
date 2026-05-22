import { Suspense } from 'react';
import { ImageIcon, TriangleAlert } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import ImageSelectionPageClient from './ImageSelectionPageClient';

interface PageProps {
  searchParams: Promise<{ upc?: string }>;
}

export const metadata = {
  title: 'Image selection | Bay State Admin',
};

function LoadingState() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-border bg-card">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm text-muted-foreground">Loading image workspace...</p>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">SKU required</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Open this workspace from the pipeline so the selected product UPC is carried into image review.
        </p>
      </div>
    </div>
  );
}

export default async function ImageSelectionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const upc = params.upc;

  return (
    <AdminPageShell
      title="Image selection"
      description="Review candidate images for a single product and send the best set back to the pipeline."
      icon={<ImageIcon className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/pipeline"
      backLabel="Back to pipeline"
      fullHeight
    >
      {upc ? (
        <Suspense fallback={<LoadingState />}>
          <ImageSelectionPageClient upc={upc} />
        </Suspense>
      ) : (
        <ErrorState />
      )}
    </AdminPageShell>
  );
}
