'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface JsonPreviewProps {
  data: Record<string, unknown>;
}

export function JsonPreview({ data }: JsonPreviewProps) {
  const [copied, setCopied] = useState(false);

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">JSON Preview</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 w-8 p-0"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        <pre className="p-4 text-xs font-mono bg-gray-900 text-gray-100 overflow-auto h-full">
          {jsonString}
        </pre>
      </CardContent>
    </div>
  );
}
