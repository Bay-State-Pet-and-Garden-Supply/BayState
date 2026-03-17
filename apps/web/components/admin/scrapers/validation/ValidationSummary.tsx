
'use client';

import { useFormContext } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ValidationSummary() {
  const { formState: { errors, isValid, isSubmitted } } = useFormContext();

  if (!isSubmitted || isValid || Object.keys(errors).length === 0) {
    return null;
  }

  // Helper to flatten nested errors for summary
  const getErrorMessages = (obj: any, prefix = ''): string[] => {
    let messages: string[] = [];
    
    for (const key in obj) {
      if (obj[key]?.message) {
        // It's an error object
        const label = prefix ? `${prefix}.${key}` : key;
        messages.push(`${label}: ${obj[key].message}`);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // It's a nested object (e.g. array field error)
        // Skip array-like objects that are actually errors (like ref)
        if (!obj[key].ref) {
           messages = [...messages, ...getErrorMessages(obj[key], prefix ? `${prefix}.${key}` : key)];
        }
      }
    }
    
    return messages;
  };

  const errorMessages = getErrorMessages(errors);

  return (
    <Alert variant="destructive" className="mb-6 animate-in slide-in-from-top-2">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Validation Errors</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
          {errorMessages.slice(0, 5).map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
          {errorMessages.length > 5 && (
            <li>...and {errorMessages.length - 5} more errors</li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
