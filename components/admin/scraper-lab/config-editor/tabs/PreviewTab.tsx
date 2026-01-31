'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Card, CardContent } from '@/components/ui/card';

export function PreviewTab() {
  const { watch } = useFormContext<ScraperConfig>();
  const values = watch();

  return (
    <div className="h-full">
      <Card className="h-full border-none shadow-none bg-muted/20">
        <CardContent className="p-0 h-full">
          <pre className="p-4 text-xs font-mono overflow-auto h-[600px] rounded-lg bg-slate-950 text-slate-50">
            {JSON.stringify(values, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
