'use client';

import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface YamlViewerProps {
  yaml: string;
  filename?: string;
}

export function YamlViewer({ yaml, filename }: YamlViewerProps) {
  const { theme } = useTheme();

  return (
    <Card className="w-full h-full min-h-[600px] flex flex-col border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium font-mono text-muted-foreground">
            {filename || 'configuration.yaml'}
          </CardTitle>
          <div className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Read Only
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 relative min-h-[500px]">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          value={yaml}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 }
          }}
          loading={
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
