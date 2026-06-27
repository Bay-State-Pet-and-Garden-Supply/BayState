'use client';

import { cn } from '@/lib/utils';

interface BrandSourceSetupStepIndicatorProps {
  steps: string[];
  currentStep: number;
  completed: boolean[];
}

/**
 * Horizontal step indicator for the Brand Source Setup drawer.
 * Renders numbered circles with labels connected by lines.
 */
export function BrandSourceSetupStepIndicator({
  steps,
  currentStep,
  completed,
}: BrandSourceSetupStepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4 bg-muted/30 border-b border-border">
      {steps.map((step, index) => {
        const isActive = currentStep === index;
        const isCompleted = completed[index];
        const isLast = index === steps.length - 1;

        return (
          <div key={step} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold border transition-colors',
                  isActive &&
                    'border-primary bg-primary text-primary-foreground',
                  isCompleted &&
                    !isActive &&
                    'border-brand-forest-green bg-brand-forest-green text-white',
                  !isActive &&
                    !isCompleted &&
                    'border-border text-muted-foreground bg-card',
                )}
              >
                {isCompleted ? '✓' : index + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  isActive && 'text-foreground',
                  isCompleted && 'text-brand-forest-green',
                  !isActive && !isCompleted && 'text-muted-foreground',
                )}
              >
                {step}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'h-px w-6',
                  completed[index] ? 'bg-brand-forest-green' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
