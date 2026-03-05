'use client';

import { useFormContext, useFieldArray } from 'react-hook-form';
import {
  Plus,
  Play,
  Loader,
  Sparkles,
  Layers,
  Link,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';
import { WorkflowStepCard } from './WorkflowStepCard';

export function WorkflowTab() {
  const form = useFormContext<ConfigFormValues>();
  const { control } = form;

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'workflows',
  });

  const addWorkflowStep = (defaultAction: string = '') => {
    append({
      action: defaultAction,
      name: '',
      params: {},
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Steps</h2>
          <p className="text-sm text-muted-foreground">
            Define the sequence of actions the scraper will execute.
          </p>
        </div>
        <Button onClick={() => addWorkflowStep()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Step
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No workflow steps defined yet.</p>
            <Button variant="outline" onClick={() => addWorkflowStep('navigate')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Step
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <WorkflowStepCard
              key={field.id}
              index={index}
              control={control}
              remove={remove}
              move={move}
              fieldsLength={fields.length}
              fieldId={field.id}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workflow Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Start with a <strong>navigate</strong> action to load the target page</p>
          <p>• Use <strong>wait</strong> or <strong>wait_for</strong> actions to allow pages to fully load</p>
          <p>• Use <strong>click</strong> actions to navigate pagination or open details</p>
          <p>• Use <strong>input_text</strong> for search boxes and login forms</p>
          <p>• End with an <strong>extract</strong> or <strong>extract_and_transform</strong> action to gather the data</p>
          <p>• Use <strong>check_no_results</strong> to handle empty result pages</p>
          <p>• Use <strong>login</strong> for authenticated scraping flows</p>
        </CardContent>
      </Card>
    </div>
  );
}
