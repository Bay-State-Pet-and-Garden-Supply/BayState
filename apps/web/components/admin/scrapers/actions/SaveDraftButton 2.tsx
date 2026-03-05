
'use client';

import { useTransition } from 'react';
import { useFormContext } from 'react-hook-form';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { updateDraft } from '@/lib/admin/scraper-configs/actions';
import { ConfigFormValues } from '../form-schema';

interface SaveDraftButtonProps {
  configId: string;
}

export function SaveDraftButton({ configId }: SaveDraftButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { watch, formState: { isDirty } } = useFormContext<ConfigFormValues>();
  const values = watch();

  const handleSave = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('config', JSON.stringify(values));
      formData.append('change_summary', 'Auto-save from editor');

      const result = await updateDraft(formData);

      if (result.success) {
        toast.success('Draft saved successfully');
      } else {
        toast.error('Failed to save draft', {
          description: result.error || 'Unknown error occurred',
        });
      }
    });
  };

  return (
    <Button 
      size="sm" 
      onClick={handleSave} 
      disabled={isPending || !isDirty}
    >
      <Save className="mr-2 h-4 w-4" />
      {isPending ? 'Saving...' : 'Save Draft'}
    </Button>
  );
}
