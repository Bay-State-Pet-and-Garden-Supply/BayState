'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CheckoutStepProps {
  number: number;
  title: string;
  isOpen: boolean;
  isCompleted: boolean;
  onEdit: () => void;
  children: React.ReactNode;
  summary?: React.ReactNode;
}

export function CheckoutStep({
  number,
  title,
  isOpen,
  isCompleted,
  onEdit,
  children,
  summary,
}: CheckoutStepProps) {
  return (
    <div className={cn(
      "overflow-hidden border-b border-border last:border-0 transition-all duration-300",
      isOpen ? "bg-white pb-8" : "bg-transparent py-6"
    )}>
      <div className="flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300",
            isCompleted 
              ? "bg-primary text-primary-foreground" 
              : isOpen 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted text-muted-foreground"
          )}>
            {isCompleted ? <Check className="h-5 w-5" /> : number}
          </div>
          <h2 className={cn(
            "font-display text-xl transition-colors duration-300",
            isOpen || isCompleted ? "text-foreground" : "text-muted-foreground"
          )}>
            {title}
          </h2>
        </div>
        
        {isCompleted && !isOpen && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onEdit}
            className="text-primary hover:text-primary/80 font-semibold"
          >
            Edit
          </Button>
        )}
      </div>

      <div className={cn(
        "grid transition-all duration-300 ease-in-out",
        isOpen ? "grid-rows-[1fr] opacity-100 mt-6" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-6 lg:pl-18">
            {children}
          </div>
        </div>
      </div>

      {!isOpen && isCompleted && summary && (
        <div className="mt-2 px-4 sm:px-6 lg:pl-18 text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-300">
          {summary}
        </div>
      )}
    </div>
  );
}
