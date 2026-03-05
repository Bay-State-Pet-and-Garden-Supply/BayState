
'use client';

import { useFormContext } from 'react-hook-form';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfigFormValues } from '../form-schema';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export function PreviewTab() {
  const { watch } = useFormContext<ConfigFormValues>();
  const values = watch();

  return (
    <div className="space-y-4 h-full min-h-[500px]">
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>JSON Preview</CardTitle>
          <CardDescription>
            Real-time preview of the generated configuration JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden min-h-[500px]">
          <MonacoEditor
            height="100%"
            language="json"
            theme="vs-dark"
            value={JSON.stringify(values, null, 2)}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
