
'use client';

import { useTransition } from 'react';
import { useFormContext } from 'react-hook-form';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { validateDraft } from '@/lib/admin/scraper-configs/actions';
import { ConfigFormValues } from '../form-schema';

interface ValidateButtonProps {
  configId: string;
  onValidationSuccess?: (result: any) => void;
}

export function ValidateButton({ configId, onValidationSuccess }: ValidateButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { formState: { isValid, isDirty }, trigger } = useFormContext<ConfigFormValues>();

  const handleValidate = async () => {
    // First trigger client-side validation
    const isClientValid = await trigger();
    if (!isClientValid) {
      toast.error('Please fix form errors before validating');
      return;
    }

    startTransition(async () => {
      const result = await validateDraft(configId);
      
      if (result.success) {
        toast.success('Configuration is valid!');
        onValidationSuccess?.(result.data);
      } else {
        toast.error('Validation failed', {
          description: result.error || 'Server validation failed',
        });
      }
    });
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleValidate}
      disabled={isPending || !isValid}
      className="gap-2"
    >
      {isPending ? (
        <span className="animate-pulse">Validating...</span>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Validate
        </>
      )}
    </Button>
  );
}
