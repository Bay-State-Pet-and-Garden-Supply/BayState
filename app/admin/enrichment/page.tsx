'use client';

import { useState } from 'react';
import { EnrichmentLauncher } from '@/components/admin/enrichment/EnrichmentLauncher';
import { MethodSelection, EnrichmentMethod } from '@/components/admin/enrichment/MethodSelection';
import { ChunkConfig } from '@/components/admin/enrichment/ChunkConfig';
import { ReviewSubmit } from '@/components/admin/enrichment/ReviewSubmit';

const STEPS = [
  { id: 1, name: 'Products' },
  { id: 2, name: 'Method' },
  { id: 3, name: 'Config' },
  { id: 4, name: 'Review' }
];

export default function EnrichmentPage() {
  const [step, setStep] = useState(1);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [method, setMethod] = useState<EnrichmentMethod>('scrapers');
  const [methodConfig, setMethodConfig] = useState<unknown>(null);
  const [chunkConfig, setChunkConfig] = useState<{ chunkSize: number; maxWorkers: number; maxRunners?: number } | null>(null);

  const handleProductsNext = (skus: string[]) => {
    setSelectedSkus(skus);
    setStep(2);
  };

  const handleMethodNext = (data: { method: EnrichmentMethod; config: unknown }) => {
    setMethod(data.method);
    setMethodConfig(data.config);
    setStep(3);
  };

  const handleConfigNext = (data: { chunkSize: number; maxWorkers: number; maxRunners?: number }) => {
    setChunkConfig(data);
    setStep(4);
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Product Enrichment</h1>
        <p className="text-muted-foreground mt-2">
          Configure and launch data enrichment jobs for your products.
        </p>
      </div>

      <nav aria-label="Progress" className="mb-8">
        <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
          {STEPS.map((s) => {
            const isCompleted = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li key={s.id} className="md:flex-1">
                <div
                  className={`group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 transition-all duration-300 ${
                    isCompleted
                      ? 'border-[#008850]'
                      : isCurrent
                      ? 'border-[#008850]'
                      : 'border-muted'
                  }`}
                >
                  <span
                    className={`text-sm font-medium transition-colors ${
                      isCompleted || isCurrent ? 'text-[#008850]' : 'text-muted-foreground'
                    }`}
                  >
                    Step {s.id}
                  </span>
                  <span className={`text-base font-semibold ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.name}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="bg-background rounded-lg border shadow-sm p-6 mt-8">
        {/* We use class hiding to preserve internal component state when navigating back and forth */}
        <div className={step === 1 ? 'block animate-in fade-in zoom-in-95 duration-300' : 'hidden'}>
          <EnrichmentLauncher onNext={handleProductsNext} />
        </div>
        
        <div className={step === 2 ? 'block animate-in fade-in zoom-in-95 duration-300' : 'hidden'}>
          <MethodSelection 
            selectedSkus={selectedSkus} 
            onNext={handleMethodNext} 
            onBack={handleBack} 
          />
        </div>
        
        <div className={step === 3 ? 'block animate-in fade-in zoom-in-95 duration-300' : 'hidden'}>
          <ChunkConfig 
            method={method}
            config={methodConfig}
            selectedSkus={selectedSkus}
            onNext={handleConfigNext}
            onBack={handleBack}
          />
        </div>
        
        <div className={step === 4 ? 'block animate-in fade-in zoom-in-95 duration-300' : 'hidden'}>
          <ReviewSubmit 
            selectedSkus={selectedSkus}
            method={method}
            methodConfig={methodConfig || { scrapers: [] }} // fallback to avoid errors on mount
            chunkConfig={chunkConfig || { chunkSize: 50, maxWorkers: 3 }} // fallback to avoid errors on mount
            onBack={handleBack}
          />
        </div>
      </div>
    </div>
  );
}
