import { useState, useEffect } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface DiscoveryConfig {
    max_search_results: number; // 1-10, default 5
    llm_model: 'gpt-4o-mini' | 'gpt-4o'; // default 'gpt-4o-mini'
    max_steps: number; // 1-50, default 15
    confidence_threshold: number; // 0-1, default 0.7
}

interface ScrapersConfig {
    scrapers: string[]; // Array of scraper names
}

export type EnrichmentMethod = 'scrapers' | 'discovery';

export interface MethodSelectionProps {
    selectedSkus: string[];
    onNext: (data: { method: EnrichmentMethod; config: DiscoveryConfig | ScrapersConfig }) => void;
    onBack?: () => void;
}

interface Scraper {
    id: string;
    name: string;
    description: string | null;
    status: string;
}

export function MethodSelection({ selectedSkus, onNext, onBack }: MethodSelectionProps) {
    const [method, setMethod] = useState<EnrichmentMethod>('discovery');
    const [scrapers, setScrapers] = useState<Scraper[]>([]);
    const [loadingScrapers, setLoadingScrapers] = useState(false);
    const [scrapersError, setScrapersError] = useState<string | null>(null);
    const [selectedScrapers, setSelectedScrapers] = useState<string[]>([]);

    const [discoveryConfig, setDiscoveryConfig] = useState<DiscoveryConfig>({
        max_search_results: 5,
        llm_model: 'gpt-4o-mini',
        max_steps: 15,
        confidence_threshold: 0.7
    });

    useEffect(() => {
        if (method === 'scrapers' && scrapers.length === 0 && !loadingScrapers && !scrapersError) {
            fetchScrapers();
        }
    }, [method]);

    const fetchScrapers = async () => {
        setLoadingScrapers(true);
        setScrapersError(null);
        try {
            const response = await fetch('/api/admin/scrapers');
            if (!response.ok) {
                throw new Error('Failed to fetch scrapers');
            }
            const data = await response.json();
            // Filter for active scrapers only
            setScrapers(data.filter((s: Scraper) => s.status === 'active' || s.status === 'operational'));
        } catch (error) {
            console.error('Error fetching scrapers:', error);
            setScrapersError(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setLoadingScrapers(false);
        }
    };

    const handleNext = () => {
        if (method === 'scrapers') {
            onNext({ method, config: { scrapers: selectedScrapers } });
        } else {
            onNext({ method, config: discoveryConfig });
        }
    };

    const toggleScraper = (scraperId: string) => {
        setSelectedScrapers(prev => 
            prev.includes(scraperId) 
                ? prev.filter(id => id !== scraperId)
                : [...prev, scraperId]
        );
    };

    const isNextDisabled = method === 'scrapers' && selectedScrapers.length === 0;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Select Enrichment Method</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Choose how you want to enrich the {selectedSkus.length} selected SKUs.
                </p>
            </div>

            <RadioGroup 
                value={method} 
                onValueChange={(val) => setMethod(val as EnrichmentMethod)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
                <div className="relative">
                    <RadioGroupItem 
                        value="scrapers" 
                        id="method-scrapers" 
                        className="peer sr-only"
                        data-testid="enrichment-method-scrapers"
                    />
                    <Label
                        htmlFor="method-scrapers"
                        className="flex flex-col items-start gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                        <span className="font-semibold">Static Scrapers</span>
                        <span className="text-sm text-muted-foreground font-normal">
                            Run predefined, site-specific scrapers to gather precise data. Best for known suppliers.
                        </span>
                    </Label>
                </div>
                
                <div className="relative">
                    <RadioGroupItem 
                        value="discovery" 
                        id="method-discovery" 
                        className="peer sr-only"
                        data-testid="enrichment-method-discovery"
                    />
                    <Label
                        htmlFor="method-discovery"
                        className="flex flex-col items-start gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                        <span className="font-semibold">AI Discovery</span>
                        <span className="text-sm text-muted-foreground font-normal">
                            Use LLMs to intelligently search the web and discover product information. Best for unknown or obscure items.
                        </span>
                    </Label>
                </div>
            </RadioGroup>

            <div className="border rounded-md p-6 bg-card">
                {method === 'scrapers' ? (
                    <div className="space-y-4" data-testid="scraper-selection-panel">
                        <h4 className="font-medium">Select Scrapers</h4>
                        <p className="text-sm text-muted-foreground">Choose which scrapers to run against the selected SKUs.</p>
                        
                        {loadingScrapers ? (
                            <div className="flex items-center justify-center p-8 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                Loading scrapers...
                            </div>
                        ) : scrapersError ? (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    Error loading scrapers: {scrapersError}. 
                                    <Button variant="link" className="px-2" onClick={fetchScrapers}>Try again</Button>
                                </AlertDescription>
                            </Alert>
                        ) : scrapers.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed">
                                No active scrapers found.
                            </div>
                        ) : (
                            <div className="grid gap-3 pt-2" data-testid="scraper-checklist">
                                {scrapers.map(scraper => (
                                    <div key={scraper.id} className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                                        <Checkbox 
                                            id={`scraper-${scraper.id}`} 
                                            checked={selectedScrapers.includes(scraper.id)}
                                            onCheckedChange={() => toggleScraper(scraper.id)}
                                            data-testid={`scraper-checkbox-${scraper.id}`}
                                        />
                                        <div className="space-y-1 leading-none">
                                            <label 
                                                htmlFor={`scraper-${scraper.id}`}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                            >
                                                {scraper.name}
                                            </label>
                                            {scraper.description && (
                                                <p className="text-sm text-muted-foreground">
                                                    {scraper.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6" data-testid="discovery-config-panel">
                        <div>
                            <h4 className="font-medium">Discovery Configuration</h4>
                            <p className="text-sm text-muted-foreground">Configure the AI agent parameters.</p>
                        </div>
                        
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-3">
                                <Label htmlFor="llm-model">LLM Model</Label>
                                <Select 
                                    value={discoveryConfig.llm_model} 
                                    onValueChange={(val: 'gpt-4o-mini' | 'gpt-4o') => 
                                        setDiscoveryConfig(prev => ({ ...prev, llm_model: val }))
                                    }
                                >
                                    <SelectTrigger id="llm-model" data-testid="config-llm-model">
                                        <SelectValue placeholder="Select a model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, Cheaper)</SelectItem>
                                        <SelectItem value="gpt-4o">GPT-4o (More Accurate)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="max-results">Max Search Results</Label>
                                <Input 
                                    id="max-results"
                                    type="number" 
                                    min={1} 
                                    max={10} 
                                    value={discoveryConfig.max_search_results}
                                    onChange={(e) => setDiscoveryConfig(prev => ({ 
                                        ...prev, 
                                        max_search_results: Math.min(10, Math.max(1, parseInt(e.target.value) || 5)) 
                                    }))}
                                    data-testid="config-max-results"
                                />
                                <p className="text-xs text-muted-foreground">Number of pages to analyze per step (1-10)</p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Max Agent Steps</Label>
                                    <span className="text-sm text-muted-foreground">{discoveryConfig.max_steps}</span>
                                </div>
                                <Slider 
                                    min={1} 
                                    max={50} 
                                    step={1} 
                                    value={[discoveryConfig.max_steps]} 
                                    onValueChange={(vals) => setDiscoveryConfig(prev => ({ ...prev, max_steps: vals[0] }))}
                                    data-testid="config-max-steps"
                                />
                                <p className="text-xs text-muted-foreground">Maximum navigation actions before giving up</p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Confidence Threshold</Label>
                                    <span className="text-sm text-muted-foreground">
                                        {Math.round(discoveryConfig.confidence_threshold * 100)}%
                                    </span>
                                </div>
                                <Slider 
                                    min={0.1} 
                                    max={1.0} 
                                    step={0.05} 
                                    value={[discoveryConfig.confidence_threshold]} 
                                    onValueChange={(vals) => setDiscoveryConfig(prev => ({ ...prev, confidence_threshold: vals[0] }))}
                                    data-testid="config-confidence"
                                />
                                <p className="text-xs text-muted-foreground">Minimum certainty required to save found data</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-between pt-4 border-t">
                {onBack ? (
                    <Button variant="outline" onClick={onBack}>
                        Back
                    </Button>
                ) : <div />}
                
                <Button 
                    onClick={handleNext} 
                    disabled={isNextDisabled}
                    data-testid="enrichment-next-button"
                >
                    Continue
                </Button>
            </div>
        </div>
    );
}
