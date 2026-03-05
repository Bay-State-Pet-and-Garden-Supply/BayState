'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateRunnerMetadata } from '@/app/admin/scrapers/network/[id]/actions';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { RunnerDetail } from './runner-detail-client';

interface RunnerMetadataEditorProps {
  runner: RunnerDetail;
}

export function RunnerMetadataEditor({ runner }: RunnerMetadataEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [jsonContent, setJsonContent] = useState(
    JSON.stringify(runner.metadata || {}, null, 2)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateJson = (content: string): { valid: boolean; data?: Record<string, unknown>; error?: string } => {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { valid: false, error: 'Metadata must be a JSON object' };
      }
      return { valid: true, data: parsed };
    } catch {
      return { valid: false, error: 'Invalid JSON format' };
    }
  };

  const handleSave = () => {
    const validation = validateJson(jsonContent);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid JSON');
      return;
    }

    setError(null);
    setIsEditing(false);

    startTransition(async () => {
      const result = await updateRunnerMetadata(runner.id, validation.data!);
      if (result.success) {
        toast.success('Metadata updated successfully');
      } else {
        toast.error(result.error || 'Failed to update metadata');
        // Revert to original content on failure
        setJsonContent(JSON.stringify(runner.metadata || {}, null, 2));
      }
    });
  };

  const handleCancel = () => {
    setJsonContent(JSON.stringify(runner.metadata || {}, null, 2));
    setIsEditing(false);
    setError(null);
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      setJsonContent(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      // Keep as is if invalid
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Runner Metadata</span>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <Textarea
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              className="font-mono min-h-[300px]"
              placeholder="Enter metadata as JSON object"
              disabled={isPending}
            />
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={formatJson}>
                Format JSON
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter metadata as a JSON object. Keys and values must be valid JSON.
            </p>
          </div>
        ) : (
          <pre className="bg-slate-50 p-4 rounded-lg overflow-auto max-h-[400px] text-sm">
            <code>{JSON.stringify(runner.metadata || {}, null, 2)}</code>
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
