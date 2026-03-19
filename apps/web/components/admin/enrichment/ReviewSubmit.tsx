import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle, CheckCircle2, List, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ReviewSubmitProps {
    selectedSkus: string[];
    method: 'scrapers' | 'ai_search' | 'consolidation';
    methodConfig: unknown;
    chunkConfig: {
        chunkSize: number;
        maxWorkers: number;
        maxRunners?: number;
    };
    onBack?: () => void;
}

interface ScraperMethodConfig {
    scrapers: string[];
}

interface AISearchMethodConfig {
    extraction_strategy?: string;
    llm_model?: string;
    cache_enabled?: boolean;
    costEstimate?: string | number;
}

export function ReviewSubmit({
    selectedSkus,
    method,
    methodConfig,
    chunkConfig,
    onBack
}: ReviewSubmitProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scraperConfig = methodConfig as ScraperMethodConfig;
    const aiSearchConfig = methodConfig as AISearchMethodConfig;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            if (method === 'consolidation') {
                const response = await fetch('/api/admin/consolidation/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skus: selectedSkus }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Failed to start consolidation: ${response.statusText}`);
                }

                const data = await response.json();
                const batchId = data.batch_id || data.jobId;
                window.location.href = `/admin/pipeline?batchId=${batchId}`;
                return;
            }

            const configPayload = method === 'ai_search'
                ? { aiSearchConfig: methodConfig }
                : { scrapers: scraperConfig.scrapers };

            const response = await fetch('/api/admin/enrichment/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skus: selectedSkus,
                    method: method,
                    config: configPayload,
                    chunkSize: chunkConfig.chunkSize,
                    maxWorkers: chunkConfig.maxWorkers,
                    maxRunners: chunkConfig.maxRunners,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to create enrichment job: ${response.statusText}`);
            }

            const data = await response.json();
            window.location.href = `/admin/scrapers/runs/${data.jobId}`;
        } catch (err: unknown) {
            console.error('Submit error:', err);
            setError((err as Error).message || 'An unexpected error occurred while creating the job.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Review & Submit</h2>
                    <p className="text-muted-foreground mt-1">Review your enrichment job configuration before starting.</p>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription className="flex items-center justify-between">
                        <span>{error}</span>
                        <Button variant="outline" size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-border/40 shadow-sm bg-card/50">
                    <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <List className="h-5 w-5 text-primary" />
                            Job Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex justify-between items-center p-3 rounded-lg bg-background border border-border/40">
                            <span className="text-muted-foreground font-medium">Products Selected</span>
                            <Badge variant="secondary" className="text-base px-3 py-1 font-bold font-mono">
                                {selectedSkus.length.toLocaleString()}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-lg bg-background border border-border/40">
                            <span className="text-muted-foreground font-medium">Enrichment Method</span>
                            <Badge className="capitalize text-sm font-semibold">
                                {method === 'scrapers' ? 'Static Scrapers' :
                                    method === 'ai_search' ? 'AI Search' : 'AI Consolidation'}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-lg bg-background border border-border/40">
                            <span className="text-muted-foreground font-medium">Est. Batches</span>
                            <span className="font-mono font-medium">
                                {Math.ceil(selectedSkus.length / chunkConfig.chunkSize).toLocaleString()}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/40 shadow-sm bg-card/50">
                    <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Settings className="h-5 w-5 text-primary" />
                            Configuration Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Method Details</h4>
                            {method === 'scrapers' ? (
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Selected Scrapers:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {scraperConfig.scrapers?.map((scraper: string) => (
                                            <Badge key={scraper} variant="outline" className="bg-background">
                                                {scraper}
                                            </Badge>
                                        )) || <span className="text-sm text-muted-foreground italic">None selected</span>}
                                    </div>
                                </div>
                            ) : method === 'ai_search' ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Strategy:</span>
                                        <span className="font-medium uppercase">{aiSearchConfig.extraction_strategy}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Model:</span>
                                        <span className="font-medium">{aiSearchConfig.llm_model || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Caching:</span>
                                        <span className="font-medium">{aiSearchConfig.cache_enabled ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                    {aiSearchConfig.costEstimate && (
                                        <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                                            <div className="flex justify-between items-center text-sm font-semibold">
                                                <span>Estimated Cost:</span>
                                                <span>${aiSearchConfig.costEstimate}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2 p-3 rounded-lg bg-purple-50 border border-purple-100">
                                    <p className="text-sm text-purple-800">
                                        Running AI Consolidation on {selectedSkus.length} products.
                                    </p>
                                    <p className="text-xs text-purple-600 mt-1">
                                        This will use GPT-4o to merge multiple scraper results into optimal product records.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-border/40 my-4" />

                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Execution Settings</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Chunk Size:</span>
                                    <span className="font-mono">{chunkConfig.chunkSize}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Max Workers:</span>
                                    <span className="font-mono">{chunkConfig.maxWorkers}</span>
                                </div>
                                {chunkConfig.maxRunners && (
                                    <div className="flex justify-between col-span-2">
                                        <span className="text-muted-foreground">Max Concurrent Runners:</span>
                                        <span className="font-mono">{chunkConfig.maxRunners}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border/40">
                {onBack && (
                    <Button
                        variant="outline"
                        onClick={onBack}
                        disabled={isSubmitting}
                        className="px-6"
                    >
                        Back
                    </Button>
                )}
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || selectedSkus.length === 0}
                    className="px-8 min-w-[140px] relative"
                    data-testid="enrichment-submit-button"
                >
                    {isSubmitting ? (
                        <>
                            <Spinner className="mr-2 h-4 w-4" />
                            <span>Creating Job...</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Start Enrichment
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
