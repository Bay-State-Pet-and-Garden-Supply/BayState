'use client';

import React, { useState } from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import YAML from 'yaml';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

export function YamlPreview() {
  const { config } = useScraperEditorStore();
  const [copied, setCopied] = useState(false);
  
  const yamlString = React.useMemo(() => {
    return YAML.stringify(config);
  }, [config]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(yamlString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-muted/50 p-4 border-b flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          This is a live preview of the generated YAML configuration.
        </p>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="flex-1 bg-muted/10 dark:bg-slate-950 p-4 overflow-auto">
        <pre className="font-mono text-sm text-foreground dark:text-green-400">
          {yamlString}
        </pre>
      </div>
    </div>
  );
}
