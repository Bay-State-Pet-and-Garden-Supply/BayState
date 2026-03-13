import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface ValidationSummaryProps {
  errors: string[];
}

export function ValidationSummary({ errors }: ValidationSummaryProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Validation Failed</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {errors.slice(0, 5).map((err, i) => (
            <li key={i} className="text-sm font-medium">{err}</li>
          ))}
          {errors.length > 5 && (
            <li className="text-sm italic">...and {errors.length - 5} more errors.</li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
