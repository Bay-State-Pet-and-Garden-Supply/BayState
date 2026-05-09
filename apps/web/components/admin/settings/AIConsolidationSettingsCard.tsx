'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Layers, Save, RefreshCw } from 'lucide-react';
import { AIModelCombobox } from '@/components/admin/settings/AIModelCombobox';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

interface ProviderStatus {
 provider: string;
 configured: boolean;
 last4: string | null;
 updated_at: string | null;
}

interface ConsolidationDefaults {
 llm_provider: string;
 llm_model: string;
 llm_base_url: string | null;
 llm_supports_batch_api: boolean;
 confidence_threshold: number;
}

interface SettingsApiResponse {
 defaults: ConsolidationDefaults;
 statuses: Record<string, ProviderStatus>;
}

const DEFAULTS: ConsolidationDefaults = {
 llm_provider: 'deepseek',
 llm_model: DEFAULT_AI_MODEL,
 llm_base_url: null,
 llm_supports_batch_api: false,
 confidence_threshold: 0.7,
};

const EMPTY_STATUS: ProviderStatus = {
 provider: '',
 configured: false,
 last4: null,
 updated_at: null,
};

export function AIConsolidationSettingsCard() {
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [successMsg, setSuccessMsg] = useState<string | null>(null);

 const [deepseekApiKey, setDeepseekApiKey] = useState('');
 const [deepseekStatus, setDeepseekStatus] = useState<ProviderStatus>(EMPTY_STATUS);

 const [defaults, setDefaults] = useState<ConsolidationDefaults>(DEFAULTS);
 const [initialDefaults, setInitialDefaults] = useState<ConsolidationDefaults>(DEFAULTS);

 const fetchConfig = async () => {
 setLoading(true);
 setError(null);

 try {
 const res = await fetch('/api/admin/consolidation/settings');
 if (!res.ok) {
 throw new Error('Failed to load AI consolidation settings');
 }

 const data = (await res.json()) as SettingsApiResponse;
 const merged: ConsolidationDefaults = {
 ...DEFAULTS,
 ...data.defaults,
 };

 setDefaults(merged);
 setInitialDefaults({ ...merged });
 setDeepseekStatus(data.statuses?.deepseek ?? EMPTY_STATUS);
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Unknown error');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 void fetchConfig();
 }, []);

 const hasChanges = useMemo(() => {
 return (
 deepseekApiKey.trim().length > 0 ||
 defaults.llm_model !== initialDefaults.llm_model ||
 defaults.confidence_threshold !== initialDefaults.confidence_threshold
 );
 }, [defaults, initialDefaults, deepseekApiKey]);

 const onSave = async () => {
 setSaving(true);
 setError(null);
 setSuccessMsg(null);

 try {
 const payload: Record<string, unknown> = {};
 if (deepseekApiKey.trim()) {
 payload.deepseek_api_key = deepseekApiKey.trim();
 }
 payload.defaults = {
 llm_provider: 'deepseek',
 llm_model: defaults.llm_model,
 confidence_threshold: defaults.confidence_threshold,
 };

 const res = await fetch('/api/admin/consolidation/settings', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });

 if (!res.ok) {
 const body = await res.json();
 throw new Error(body?.error || 'Failed to save settings');
 }

 await fetchConfig();
 setDeepseekApiKey('');
 setSuccessMsg('DeepSeek consolidation settings saved');
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Unknown error');
 } finally {
 setSaving(false);
 }
 };

 return (
 <Card>
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-border">
 <Layers className="h-5 w-5 text-white" />
 </div>
 <div>
 <CardTitle>AI Consolidation Settings</CardTitle>
 <CardDescription>
 DeepSeek is the consolidation provider. All jobs run asynchronously through
 Bay State&apos;s synthetic queue layer.
 </CardDescription>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-6">
 {loading ? (
 <div className="flex justify-center py-4">
 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
 </div>
 ) : (
 <>
 {error && (
 <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
 )}
 {successMsg && (
 <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{successMsg}</div>
 )}

 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="consolidation-deepseek-key">DeepSeek API Key</Label>
 <Input
 id="consolidation-deepseek-key"
 type="password"
 value={deepseekApiKey}
 onChange={(e) => setDeepseekApiKey(e.target.value)}
 placeholder="sk-..."
 />
 <div className="text-xs text-muted-foreground">
 {deepseekStatus.configured
 ? `Configured (ending in ${deepseekStatus.last4 ?? '****'})`
 : 'Required for hosted consolidation'}
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="consolidation-deepseek-model">Model</Label>
 <AIModelCombobox
 id="consolidation-deepseek-model"
 value={defaults.llm_model}
 onChange={(value) =>
 setDefaults((prev) => ({ ...prev, llm_model: value }))
 }
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="consolidation-deepseek-confidence">
 Confidence Threshold
 </Label>
 <Input
 id="consolidation-deepseek-confidence"
 type="number"
 min={0}
 max={1}
 step={0.05}
 value={defaults.confidence_threshold}
 onChange={(e) =>
 setDefaults((prev) => ({
 ...prev,
 confidence_threshold: Number(e.target.value) || 0.7,
 }))
 }
 />
 </div>

 <div className="flex items-end space-y-2">
 <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground w-full">
 <span className="font-medium text-emerald-600">Hosted direct chat</span> —
 Consolidation jobs run asynchronously through Bay State&apos;s synthetic batch layer,
 backed by DeepSeek chat completions.
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between border-t pt-4">
 <div className="flex flex-wrap gap-2">
 <Badge
 variant={deepseekStatus.configured ? 'default' : 'secondary'}
 >
 DeepSeek {deepseekStatus.configured ? 'Ready' : 'Not Configured'}
 </Badge>
 <Badge variant="outline">
 Processing: Synthetic async
 </Badge>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" onClick={fetchConfig} disabled={loading || saving}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Refresh
 </Button>
 <Button onClick={onSave} disabled={saving || !hasChanges}>
 {saving ? (
 <>
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 Saving...
 </>
 ) : (
 <>
 <Save className="mr-2 h-4 w-4" />
 Save Settings
 </>
 )}
 </Button>
 </div>
 </div>
 </>
 )}
 </CardContent>
 </Card>
 );
}
