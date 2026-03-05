'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface PreviewTabProps {
  data: Record<string, unknown>;
}

export function PreviewTab({ data }: PreviewTabProps) {
  const jsonString = useMemo(() => {
    // Clean up undefined values for cleaner JSON
    const cleaned = { ...data };

    // Remove undefined fields recursively
    const removeUndefined = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return undefined;
      if (Array.isArray(obj)) {
        return obj.map(removeUndefined).filter((v) => v !== undefined);
      }
      if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          const cleanedValue = removeUndefined(value);
          if (cleanedValue !== undefined) {
            result[key] = cleanedValue;
          }
        }
        return result;
      }
      return obj;
    };

    const cleanedData = removeUndefined(cleaned);
    return JSON.stringify(cleanedData, null, 2);
  }, [data]);

  return (
    <div className="h-full">
      <Card className="h-full border-none shadow-none bg-muted/20">
        <CardContent className="p-0 h-full">
          <pre className="p-4 text-xs font-mono overflow-auto h-[600px] rounded-lg bg-slate-950 text-slate-50">
            {jsonString}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
