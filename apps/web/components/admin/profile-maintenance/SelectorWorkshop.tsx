'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Wrench, Play, Save, Plus, Trash2, CheckCircle2, XCircle, Loader2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface ProfileData { id: string; brand_id: string; source_slug: string; source_type: string; canonical_domain: string; status: string; active_version_id: string | null; brands: { name: string } | null }
interface VersionData { id: string; profile_id: string; version_number: number; status: string; rules: Record<string, unknown>; compiled_crawl4ai_schema: Record<string, unknown> | null; version_hash: string; created_from: string; created_at: string }
interface SeedData { id: string; url: string; normalized_url: string; trust_status: string }
interface SelectorField { field_name: string; selector: string; type: string; required: boolean; attribute?: string }
interface ExtractionResult { field: string; selector: string; extracted_value: unknown; confidence: number; error: string | null }
interface ExtractedImage { url: string; alt?: string; width?: number; height?: number; source?: string; selected?: boolean; rejected?: boolean; rejection_reason?: string }

const FIELD_TYPES = ['text', 'image', 'attribute'] as const;

function parseSelectors(rules: Record<string, unknown> | null): SelectorField[] {
  if (!rules) return [];
  const fields = rules.fields as SelectorField[] | undefined;
  if (!Array.isArray(fields)) return [];
  return fields.map(f => ({ field_name: f.field_name || '', selector: f.selector || '', type: f.type || 'text', required: f.required ?? false, attribute: f.attribute }));
}

function defaults(): SelectorField[] {
  return [
    { field_name: 'title', selector: 'h1', type: 'text', required: true },
    { field_name: 'price', selector: '.price', type: 'text', required: false },
    { field_name: 'images', selector: '.product-image img', type: 'image', required: true },
    { field_name: 'sku', selector: '.sku', type: 'text', required: false },
    { field_name: 'description', selector: '.description', type: 'text', required: false },
  ];
}

export function SelectorWorkshop({ profile, versions: _v, initialVersion, seeds }: { profile: ProfileData; versions: VersionData[]; initialVersion: VersionData | null; seeds: SeedData[] }) {
  const [selectors, setSelectors] = useState<SelectorField[]>(() => {
    const fromV = initialVersion?.rules ? parseSelectors(initialVersion.rules) : [];
    return fromV.length > 0 ? fromV : defaults();
  });
  const [testUrl, setTestUrl] = useState(seeds[0]?.url ?? '');
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSeed, setActiveSeed] = useState('custom');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [runnerAvailable, setRunnerAvailable] = useState<boolean | null>(null);
  const brandName = profile.brands?.name ?? profile.source_slug;

  // Check runner availability on mount
  useEffect(() => {
    fetch(`/api/admin/site-extraction-profiles/${profile.id}/workshop/test`)
      .then(r => r.json())
      .then(d => setRunnerAvailable(d.available ?? false))
      .catch(() => setRunnerAvailable(false));
  }, [profile.id]);

  const handleTest = useCallback(async () => {
    if (!testUrl.trim()) return;
    setTesting(true); setErrorMsg(null); setResults([]); setImages([]); setElapsed(null);
    try {
      const res = await fetch(`/api/admin/site-extraction-profiles/${profile.id}/workshop/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl.trim(), selectors }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setErrorMsg(data.error || `Failed: ${res.status}`); return; }
      setResults((data.results ?? []) as ExtractionResult[]);
      setImages((data.images ?? []) as ExtractedImage[]);
      setElapsed(data.elapsed_ms ?? null);
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'Network error'); }
    finally { setTesting(false); }
  }, [testUrl, selectors, profile.id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/site-extraction-profiles/${profile.id}/workshop/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectors }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
      const d = await res.json();
      toast.success(d.updated ? 'Draft updated' : `Version ${d.version.version_number} created`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }, [selectors, profile.id]);

  const add = useCallback(() => { setSelectors(p => [...p, { field_name: '', selector: '', type: 'text', required: false }]); setEditingIdx(selectors.length); }, [selectors.length]);
  const remove = useCallback((i: number) => { setSelectors(p => p.filter((_, j) => j !== i)); setEditingIdx(null); }, []);
  const update = useCallback((i: number, u: Partial<SelectorField>) => { setSelectors(p => p.map((s, j) => j === i ? { ...s, ...u } : s)); }, []);
  const rmap = useMemo(() => { const m = new Map<string, ExtractionResult>(); results.forEach(r => m.set(r.field, r)); return m; }, [results]);

  return (
    <div className="flex flex-col gap-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Wrench className="h-5 w-5 text-primary" /></div>
          <div><h2 className="text-sm font-bold">{brandName}</h2><p className="text-xs text-muted-foreground">{profile.canonical_domain} · {profile.source_type}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {initialVersion && <Badge variant="outline" className="text-[10px] font-mono">v{initialVersion.version_number} · {initialVersion.status}</Badge>}
          {profile.status === 'active' && <Badge variant="success" className="text-[10px] uppercase">Active</Badge>}
          <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="h-8 text-xs">{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}Save as Draft</Button>
        </div>
      </div>

      {/* Runner status banner */}
      {runnerAvailable === false && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Scraper runner is not running. Start it with: <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">cd apps/scraper && python3 daemon.py --env dev --test-mode</code></span>
        </div>
      )}

      {/* URL BAR */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input type="url" placeholder="Enter product page URL..." value={testUrl} onChange={e => setTestUrl(e.target.value)} className="h-9 text-xs" onKeyDown={e => { if (e.key === 'Enter') void handleTest(); }} />
          <Button size="sm" onClick={() => void handleTest()} disabled={testing || !testUrl.trim()} className="h-9 text-xs">{testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Test</Button>
        </div>
        {seeds.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setActiveSeed('custom')} className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium ${activeSeed === 'custom' ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>Custom URL</button>
            {seeds.map(s => (
              <button key={s.id} onClick={() => { setActiveSeed(s.id); setTestUrl(s.url); }} className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium truncate max-w-[200px] ${activeSeed === s.id ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} title={s.url}><ExternalLink className="mr-1 inline h-2.5 w-2.5" />{new URL(s.url).pathname.slice(0, 25)}</button>
            ))}
          </div>
        )}
      </div>

      {errorMsg && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><XCircle className="h-3.5 w-3.5 shrink-0" /><span>{errorMsg}</span><Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]" onClick={() => setErrorMsg(null)}>Dismiss</Button></div>}
      {elapsed !== null && <p className="text-[10px] text-muted-foreground">Completed in {(elapsed / 1000).toFixed(1)}s</p>}

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT: Selectors */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Selectors ({selectors.length})</h3>
            <Button variant="outline" size="sm" onClick={add} className="h-7 text-[10px]"><Plus className="mr-1 h-3 w-3" />Add Field</Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              {selectors.map((sel, i) => {
                const r = rmap.get(sel.field_name);
                const editing = editingIdx === i;
                const hasVal = r?.extracted_value != null && r.extracted_value !== '';
                return (
                  <div key={i} className={`rounded-lg border p-3 ${editing ? 'border-primary/30 bg-primary/5' : hasVal ? 'border-green-200/50 bg-green-50/20' : 'border-border hover:border-border/80'}`}>
                    {!editing ? (
                      <div className="flex cursor-pointer items-start gap-3" onClick={() => setEditingIdx(i)}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="text-xs font-semibold">{sel.field_name || '(unnamed)'}</span><Badge variant="outline" className="text-[9px] px-1 py-0">{sel.type}</Badge>{sel.required && <Badge variant="warning" className="text-[9px] px-1 py-0">req</Badge>}</div>
                          <p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground">{sel.selector || '(none)'}</p>
                          {r && (hasVal ? <div className="mt-1.5 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="truncate text-[10px] text-green-700">{String(r.extracted_value).slice(0, 80)}</span></div> : r.error ? <div className="mt-1.5 flex items-center gap-1.5"><XCircle className="h-3 w-3 text-destructive" /><span className="text-[10px] text-destructive">{r.error}</span></div> : <span className="mt-1.5 text-[10px] text-muted-foreground">No value</span>)}
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" onClick={e => { e.stopPropagation(); remove(i); }}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Input type="text" placeholder="Field name" value={sel.field_name} onChange={e => update(i, { field_name: e.target.value })} className="h-7 flex-1 text-xs" autoFocus />
                          <Select value={sel.type} onValueChange={v => update(i, { type: v })}><SelectTrigger className="h-7 w-24 text-[10px]"><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent></Select>
                        </div>
                        <Input type="text" placeholder="CSS selector" value={sel.selector} onChange={e => update(i, { selector: e.target.value })} className="h-7 text-xs font-mono" />
                        {sel.type === 'attribute' && <Input type="text" placeholder="Attribute name" value={sel.attribute || ''} onChange={e => update(i, { attribute: e.target.value })} className="h-7 text-xs" />}
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><input type="checkbox" checked={sel.required} onChange={e => update(i, { required: e.target.checked })} className="h-3 w-3" />Required</label>
                          <div className="ml-auto flex gap-1"><Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setEditingIdx(null)}>Done</Button><Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => remove(i)}>Remove</Button></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {selectors.length === 0 && <div className="flex flex-col items-center gap-2 py-8 text-center"><Wrench className="h-8 w-8 text-muted-foreground/40" /><p className="text-xs text-muted-foreground">No selectors. Add a field to start.</p><Button variant="outline" size="sm" onClick={add} className="h-7 text-[10px]"><Plus className="mr-1 h-3 w-3" />Add Field</Button></div>}
            </div>
          </div>
        </div>

        {/* RIGHT: Results + Images */}
        <div className="flex flex-col gap-3">
          {results.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Results</h3>
              <div className="flex flex-wrap gap-1.5">
                {results.map((r, i) => (
                  <Badge key={i} variant={r.extracted_value != null && r.extracted_value !== '' ? 'success' : 'destructive'} className="text-[9px]">{r.field}: {r.extracted_value != null && r.extracted_value !== '' ? String(r.extracted_value).slice(0, 30) : '∅'}</Badge>
                ))}
              </div>
            </div>
          )}
          {images.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Images ({images.filter(i => i.selected !== false).length} selected)</h3><ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /></div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((img, i) => (
                  <div key={i} className={`relative overflow-hidden rounded-md border ${img.rejected ? 'border-destructive/30 opacity-60' : 'border-border'}`} title={img.alt || img.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt || `Image ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                    {img.rejected && <div className="absolute bottom-0 left-0 right-0 bg-destructive/80 px-1 py-0.5 text-[8px] text-white">{img.rejection_reason || 'Rejected'}</div>}
                    {img.selected !== false && !img.rejected && <div className="absolute top-1 right-1"><CheckCircle2 className="h-3 w-3 text-green-500 drop-shadow" /></div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {results.length === 0 && images.length === 0 && !testing && elapsed !== null && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <XCircle className="h-8 w-8 text-amber-500/60" />
              <p className="text-xs font-medium text-amber-700">No selectors matched this page</p>
              <p className="text-[10px] text-muted-foreground max-w-xs">
                The extraction completed but none of your CSS selectors found matching elements on this page. 
                Click each selector to edit its CSS selector to match the page&apos;s actual HTML structure.
              </p>
            </div>
          )}
          {results.length === 0 && images.length === 0 && !testing && elapsed === null && (
            <div className="flex flex-col items-center gap-2 py-12 text-center"><Play className="h-8 w-8 text-muted-foreground/40" /><p className="text-xs text-muted-foreground">Enter a URL and click Test</p></div>
          )}
          {testing && <div className="flex flex-col items-center gap-2 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-xs text-muted-foreground">Extracting from {(() => { try { return new URL(testUrl).hostname; } catch { return testUrl; } })()}...</p></div>}
        </div>
      </div>

      {/* ACTIONS BAR */}
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">{initialVersion ? `Editing from v${initialVersion.version_number} · ${selectors.length} fields` : `${selectors.length} fields`}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testing || !testUrl.trim()} className="h-8 text-xs">{testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Test Again</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving || selectors.length === 0} className="h-8 text-xs">{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}Save as Draft</Button>
        </div>
      </div>
    </div>
  );
}
