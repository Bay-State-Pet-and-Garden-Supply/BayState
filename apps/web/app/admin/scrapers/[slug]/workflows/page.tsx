import { permanentRedirect } from 'next/navigation';

export default function WorkflowsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  // redirect to the scraper detail overview
  return params.then(p => permanentRedirect(`/admin/scrapers/${p.slug}`));
}
