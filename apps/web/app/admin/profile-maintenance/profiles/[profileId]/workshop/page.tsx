import { Metadata } from 'next';
import { Wrench } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { SelectorWorkshop } from '@/components/admin/profile-maintenance/SelectorWorkshop';
import { createAdminClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Selector Workshop | Admin', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const supabase = await createAdminClient();
  const { data: p } = await supabase.from('site_extraction_profiles').select('*, brands!inner(name)').eq('id', profileId).single();
  if (!p) return <AdminPageShell title="Workshop" description="Not found" icon={<Wrench className="h-5 w-5" />}><p className="text-sm text-muted-foreground">Profile not found.</p></AdminPageShell>;
  const [{ data: versions }, { data: seeds }] = await Promise.all([
    supabase.from('site_extraction_profile_versions').select('*').eq('profile_id', profileId).order('version_number', { ascending: false }).limit(20),
    supabase.from('product_detail_page_seeds').select('id,url,normalized_url,trust_status').eq('brand_id', (p as any).brand_id).eq('source_slug', (p as any).source_slug).eq('canonical_domain', (p as any).canonical_domain).eq('trust_status', 'verified').order('created_at', { ascending: false }).limit(10),
  ]);
  const vs = (versions ?? []) as any[]; const draft = vs.find((v: any) => v.status === 'draft');
  const active = vs.find((v: any) => v.status === 'active');
  return (
    <AdminPageShell title="Selector Workshop" description={`Edit selectors for ${(p as any).brands?.name ?? (p as any).source_slug}`} icon={<Wrench className="h-5 w-5" />} eyebrow="Workspace">
      <SelectorWorkshop profile={p as any} versions={vs} initialVersion={draft || active || vs[0] || null} seeds={(seeds ?? []) as any[]} />
    </AdminPageShell>
  );
}
