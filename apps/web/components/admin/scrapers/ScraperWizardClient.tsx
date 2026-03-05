'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Settings2,
  FileCode,
  TestTube,
  Plus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { createScraper } from '@/app/admin/scrapers/actions';

type WizardStep = 'basics' | 'config' | 'selectors' | 'test';

const steps: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'basics', label: 'Basic Info', icon: <Globe className="h-4 w-4" /> },
  { id: 'config', label: 'Configuration', icon: <Settings2 className="h-4 w-4" /> },
  { id: 'selectors', label: 'Selectors', icon: <FileCode className="h-4 w-4" /> },
  { id: 'test', label: 'Test & Save', icon: <TestTube className="h-4 w-4" /> },
];

export function ScraperWizardClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<WizardStep>('basics');

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testSkus, setTestSkus] = useState<string[]>([]);
  const [newTestSku, setNewTestSku] = useState('');

  const currentIndex = steps.findIndex((s) => s.id === currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === steps.length - 1;

  const canProceed = () => {
    switch (currentStep) {
      case 'basics':
        return name.trim() && baseUrl.trim();
      case 'config':
        return true;
      case 'selectors':
        return true;
      case 'test':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      handleCreate();
    } else {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(steps[currentIndex - 1].id);
    }
  };

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createScraper(name.trim(), baseUrl.trim(), displayName.trim() || undefined);
      if (result.success && result.data) {
        toast.success('Scraper created successfully');
        const scraperId = (result.data as { id: string }).id;
        router.push(`/admin/scrapers/${scraperId}`);
      } else {
        toast.error(result.error || 'Failed to create scraper');
      }
    });
  };

  const addTestSku = () => {
    if (newTestSku.trim() && !testSkus.includes(newTestSku.trim())) {
      setTestSkus([...testSkus, newTestSku.trim()]);
      setNewTestSku('');
    }
  };

  const removeTestSku = (sku: string) => {
    setTestSkus(testSkus.filter((s) => s !== sku));
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Plus className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create New Scraper</h1>
            <p className="text-sm text-gray-600">Set up a new scraper configuration</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/scrapers">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => index <= currentIndex && setCurrentStep(step.id)}
              disabled={index > currentIndex}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
                step.id === currentStep
                  ? 'bg-blue-100 text-blue-700'
                  : index < currentIndex
                  ? 'text-green-600 hover:bg-green-50'
                  : 'text-gray-600'
              )}
            >
              {index < currentIndex ? (
                <Check className="h-4 w-4" />
              ) : (
                step.icon
              )}
              <span className="text-sm font-medium">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-12 h-0.5 mx-2',
                  index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {currentStep === 'basics' && (
            <div className="space-y-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Enter the basic details for your scraper
                </CardDescription>
              </CardHeader>

              <div className="space-y-2">
                <Label htmlFor="name">Internal Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., amazon, chewy, petsmart"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                />
                <p className="text-xs text-gray-600">
                  Used in code and API. Lowercase, underscores allowed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="e.g., Amazon, Chewy, PetSmart"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL *</Label>
                <Input
                  id="baseUrl"
                  type="url"
                  placeholder="https://www.example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <p className="text-xs text-gray-600">
                  The main website URL for this scraper
                </p>
              </div>
            </div>
          )}

          {currentStep === 'config' && (
            <div className="space-y-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Configuration Options</CardTitle>
                <CardDescription>
                  Configure scraper behavior (these can be changed later)
                </CardDescription>
              </CardHeader>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Timeout (seconds)</Label>
                  <Input type="number" defaultValue={30} />
                </div>
                <div className="space-y-2">
                  <Label>Retries</Label>
                  <Input type="number" defaultValue={3} />
                </div>
              </div>

              <p className="text-sm text-gray-600">
                More configuration options are available in the YAML editor after creation.
              </p>
            </div>
          )}

          {currentStep === 'selectors' && (
            <div className="space-y-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Test SKUs</CardTitle>
                <CardDescription>
                  Add SKUs that should return valid product data for testing
                </CardDescription>
              </CardHeader>

              <div className="flex gap-2">
                <Input
                  placeholder="Enter a test SKU..."
                  value={newTestSku}
                  onChange={(e) => setNewTestSku(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTestSku()}
                />
                <Button onClick={addTestSku} variant="outline">
                  Add
                </Button>
              </div>

              {testSkus.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {testSkus.map((sku) => (
                    <Badge
                      key={sku}
                      variant="secondary"
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 gap-1"
                    >
                      {sku}
                      <button
                        onClick={() => removeTestSku(sku)}
                        className="ml-1 text-gray-500 hover:text-gray-700 focus:outline-none"
                      >
                        <span className="sr-only">Remove</span>
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-sm text-gray-600">
                You can add more test SKUs later in the testing page.
              </p>
            </div>
          )}

          {currentStep === 'test' && (
            <div className="space-y-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Review & Create</CardTitle>
                <CardDescription>
                  Review your scraper configuration before creating
                </CardDescription>
              </CardHeader>

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Display Name</span>
                  <span className="font-medium">{displayName || name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Base URL</span>
                  <span className="font-medium truncate max-w-xs">{baseUrl}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Test SKUs</span>
                  <span className="font-medium">{testSkus.length}</span>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                After creation, you will be redirected to the YAML editor to configure workflow steps.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={isFirstStep}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={!canProceed() || isPending}>
          {isLastStep ? (
            isPending ? 'Creating...' : 'Create Scraper'
          ) : (
            <>
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
