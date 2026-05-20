'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, ShieldAlert, Plus, CheckCircle, HelpCircle, Key, RefreshCw, X, Globe, Bot } from 'lucide-react';
import { AIModelCombobox } from '@/components/admin/settings/AIModelCombobox';
import { adminFetch } from '@/lib/admin/api-client';

interface AIProviderConfig {
  id: string;
  name: string;
  provider_type: 'deepseek' | 'openai' | 'openai_compatible' | 'gemini' | 'lmstudio';
  base_url: string | null;
  default_model: string;
  is_active: boolean;
  api_key: string; // masked
  updated_at: string | null;
}

export function AIProviderProfilesCard() {
  const [configs, setConfigs] = useState<AIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formProvider, setFormProvider] = useState<'deepseek' | 'openai' | 'openai_compatible' | 'gemini' | 'lmstudio'>('deepseek');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');

  // Models dropdown state
  const [fetchedModels, setFetchedModels] = useState<{ id: string; label?: string }[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  // Action pending states
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/ai-providers');
      if (!res.ok) {
        throw new Error('Failed to load AI provider profiles');
      }
      const data = await res.json();
      if (data.success) {
        setConfigs(data.configs || []);
      } else {
        throw new Error(data.error || 'Failed to parse configurations');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfiles();
  }, []);

  // Debounced model list loader
  useEffect(() => {
    if (!showForm) return;

    // Determine default base URLs for providers to help fetching models list
    let effectiveBaseUrl = formBaseUrl.trim();
    if (!effectiveBaseUrl) {
      if (formProvider === 'openai_compatible' || formProvider === 'deepseek') effectiveBaseUrl = 'https://api.deepseek.com';
      else if (formProvider === 'openai') effectiveBaseUrl = 'https://api.openai.com/v1';
      else if (formProvider === 'gemini') effectiveBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      else if (formProvider === 'lmstudio') effectiveBaseUrl = 'http://localhost:1234/v1';
    }

    // Don't poll if API key is empty and this isn't an edit of an existing record (where key is masked as ••••••••••••)
    if (!formApiKey && !editingId) {
      setFetchedModels([]);
      return;
    }

    const loadModels = async () => {
      setFetchingModels(true);
      setModelFetchError(null);
      try {
        const payload = {
          provider: formProvider,
          base_url: effectiveBaseUrl || undefined,
          api_key: formApiKey || undefined,
          config_id: editingId || undefined,
        };

        const res = await adminFetch('/api/admin/ai-scraping/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error('Failed to fetch models list');
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.models)) {
          setFetchedModels(data.models);
        } else {
          setFetchedModels([]);
          if (data.error) {
            setModelFetchError(data.error);
          }
        }
      } catch (e) {
        console.error('Error fetching models list:', e);
        setModelFetchError(e instanceof Error ? e.message : 'Failed to query models from endpoint.');
        setFetchedModels([]);
      } finally {
        setFetchingModels(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      void loadModels();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [formProvider, formBaseUrl, formApiKey, editingId, showForm]);

  const handleCreateNew = () => {
    setEditingId(null);
    setFormName('');
    setFormProvider('openai_compatible');
    setFormBaseUrl('');
    setFormApiKey('');
    setFormModel('deepseek-chat');
    setFetchedModels([]);
    setModelFetchError(null);
    setShowForm(true);
    setSuccess(null);
  };

  const handleEdit = (config: AIProviderConfig) => {
    setEditingId(config.id);
    setFormName(config.name);
    setFormProvider(config.provider_type);
    setFormBaseUrl(config.base_url || '');
    setFormApiKey(config.api_key); // will be masked "••••••••••••XXXX"
    setFormModel(config.default_model);
    setFetchedModels([]);
    setModelFetchError(null);
    setShowForm(true);
    setSuccess(null);
  };

  const handleActivate = async (id: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await adminFetch(`/api/admin/ai-providers/${id}/activate`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body?.error || 'Failed to activate profile');
        }
        await fetchProfiles();
        setSuccess('Active profile updated successfully.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this AI configuration profile? This action cannot be undone.')) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await adminFetch(`/api/admin/ai-providers/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body?.error || 'Failed to delete profile');
        }
        await fetchProfiles();
        setSuccess('Profile deleted.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(false);
    setError(null);
    setSuccess(null);

    if (!formName.trim()) {
      setError('Please provide a descriptive name for this profile.');
      return;
    }
    if (!formModel) {
      setError('Please select an active AI model.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editingId || undefined,
        name: formName.trim(),
        provider_type: formProvider,
        base_url: formBaseUrl.trim() || null,
        default_model: formModel,
        api_key: formApiKey,
      };

      const res = await adminFetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.details || body?.error || 'Failed to save configuration');
      }

      await fetchProfiles();
      setShowForm(false);
      setSuccess(`Profile "${formName}" saved successfully.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm rounded-none">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-brand-forest-green border border-border">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-brand-forest-green">AI Provider Profiles</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Manage custom endpoints, API keys, and model overrides. The active profile drives scraping and consolidation workflows.
              </CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button
              onClick={handleCreateNew}
              className="bg-brand-forest-green hover:bg-brand-forest-green/90 text-white rounded-none h-9 text-xs font-semibold gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add Profile
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3.5 rounded-none font-medium animate-in fade-in duration-200">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Error</p>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs p-3.5 rounded-none font-medium animate-in fade-in duration-200">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold">Success</p>
              <p className="opacity-90">{success}</p>
            </div>
          </div>
        )}

        {/* Profiles List */}
        {!showForm && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border bg-muted/10 text-center">
                <HelpCircle className="h-10 w-10 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">No AI Provider Profiles</p>
                <p className="text-xs text-muted-foreground max-w-[280px] mt-1">
                  Create a profile to configure your LLM settings for scraper extraction and batch jobs.
                </p>
                <Button onClick={handleCreateNew} variant="outline" size="sm" className="mt-4 rounded-none h-8 text-xs font-semibold">
                  Create First Profile
                </Button>
              </div>
            ) : (
              <div className="border border-border overflow-hidden">
                <div className="min-w-full divide-y divide-border">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className={`flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 transition-colors ${
                        config.is_active ? 'bg-emerald-50/20' : 'hover:bg-muted/10'
                      }`}
                    >
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-semibold text-sm truncate text-brand-forest-green">{config.name}</span>
                          <Badge variant="outline" className="rounded-none bg-muted/40 uppercase tracking-wider text-[9px] px-1.5 py-0">
                            {config.provider_type.replace('_', ' ')}
                          </Badge>
                          {config.is_active && (
                            <Badge className="rounded-none bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] px-1.5 py-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {config.base_url ? (
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-muted-foreground/75" />
                              <span className="truncate">{config.base_url}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-muted-foreground/50" />
                              <span className="italic text-muted-foreground/60">Default Endpoint</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-[10px] uppercase tracking-wider text-muted-foreground/60">Model:</span>
                            <code className="text-[11px] bg-muted/65 px-1 py-0.5 text-muted-foreground font-mono">{config.default_model}</code>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {!config.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => void handleActivate(config.id)}
                            className="rounded-none h-8 text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border-border"
                          >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(config)}
                          className="rounded-none h-8 text-xs font-semibold border-border"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={config.is_active || isPending}
                          onClick={() => void handleDelete(config.id)}
                          className="rounded-none h-8 text-xs font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 border-border"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Profile Create/Edit Form */}
        {showForm && (
          <form onSubmit={handleSave} className="space-y-5 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-1">
              <h3 className="font-bold text-sm text-brand-forest-green">
                {editingId ? `Edit Config Profile: ${formName}` : 'Create New AI Config Profile'}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowForm(false)}
                className="h-8 w-8 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Config Name */}
              <div className="space-y-1.5">
                <Label htmlFor="form-profile-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Profile Name
                </Label>
                <Input
                  id="form-profile-name"
                  type="text"
                  placeholder="e.g. Production DeepSeek, LM Studio Local"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-9 rounded-none border-input focus-visible:ring-brand-gold bg-background text-sm"
                  required
                />
              </div>

              {/* Provider Type */}
              <div className="space-y-1.5">
                <Label htmlFor="form-profile-provider" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Provider Type
                </Label>
                <select
                  id="form-profile-provider"
                  value={
                    formProvider === 'deepseek' || formProvider === 'lmstudio'
                      ? 'openai_compatible'
                      : formProvider
                  }
                  onChange={(e) => {
                    const provider = e.target.value as any;
                    setFormProvider(provider);
                    setFormModel(
                      provider === 'openai' ? 'gpt-4o-mini' :
                      provider === 'gemini' ? 'gemini-3.5-flash' : 'deepseek-chat'
                    );
                    setFormBaseUrl('');
                  }}
                  className="flex h-9 w-full rounded-none border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-gold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="openai_compatible">OpenAI Compatible (Custom API, DeepSeek, LM Studio)</option>
                  <option value="openai">OpenAI (Direct API)</option>
                  <option value="gemini">Google Gemini (Direct API)</option>
                </select>
              </div>

              {/* Base URL (Endpoint) */}
              <div className="space-y-1.5">
                <Label htmlFor="form-profile-baseurl" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground/75" /> Custom Base URL
                </Label>
                <Input
                  id="form-profile-baseurl"
                  type="text"
                  placeholder={
                    formProvider === 'openai' ? 'https://api.openai.com/v1 (default)' :
                    formProvider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta (default)' :
                    'https://api.deepseek.com/v1'
                  }
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  className="h-9 rounded-none border-input focus-visible:ring-brand-gold bg-background text-sm font-mono text-[11px]"
                />
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  Override default provider URL if proxying requests or running custom endpoints.
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <Label htmlFor="form-profile-apikey" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-muted-foreground/75" /> API Key
                </Label>
                <Input
                  id="form-profile-apikey"
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={editingId ? '•••••••••••• (Unchanged)' : 'Enter API Key (sk-...)'}
                  className="h-9 rounded-none border-input focus-visible:ring-brand-gold bg-background text-sm font-mono"
                  required={!editingId}
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  {editingId ? 'Leave field as-is to retain the existing encrypted key in the DB.' : 'Your key will be securely encrypted via AES-256-GCM before database insertion.'}
                </p>
              </div>

              {/* Model */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="form-profile-model" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Model
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AIModelCombobox
                      id="form-profile-model"
                      value={formModel}
                      options={fetchedModels}
                      placeholder="Select or enter a custom model"
                      emptyLabel="No models found at endpoint. Enter one manually."
                      onChange={(value) => setFormModel(value)}
                    />
                  </div>
                  {(fetchingModels || formApiKey || editingId) && (
                    <div className="flex items-center px-3 border border-border border-l-0 bg-muted/20 h-9 shrink-0">
                      {fetchingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand-forest-green" />
                      ) : modelFetchError ? (
                        <Badge variant="outline" className="border-destructive/25 text-destructive rounded-none bg-destructive/5 text-[9px] px-1.5" title={modelFetchError}>
                          Offline
                        </Badge>
                      ) : fetchedModels.length > 0 ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white rounded-none text-[9px] px-1.5">
                          {fetchedModels.length} Models
                        </Badge>
                      ) : (
                        <HelpCircle className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                  )}
                </div>
                {modelFetchError && (
                  <p className="text-[10px] text-destructive leading-tight font-medium">
                    Endpoint Query Alert: {modelFetchError}
                  </p>
                )}
                {!modelFetchError && fetchedModels.length === 0 && !fetchingModels && (formApiKey || editingId) && (
                  <p className="text-[10px] text-muted-foreground">
                    Model auto-discovery is active. Complete custom Endpoint/API key to retrieve models directly.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-none h-9 text-xs font-semibold border-border"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="rounded-none h-9 text-xs font-semibold bg-brand-forest-green hover:bg-brand-forest-green/90 text-white gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save Profile
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
