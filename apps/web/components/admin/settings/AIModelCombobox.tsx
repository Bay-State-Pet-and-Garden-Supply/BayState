'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AI_MODEL_OPTIONS, getAIModelLabel } from '@/lib/ai-scraping/models';

interface ModelOption {
  id: string;
  label?: string;
}

interface AIModelComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options?: ModelOption[];
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
}

export function AIModelCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  searchPlaceholder,
}: AIModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const modelOptions = useMemo(() => {
    if (options) {
      return options.map((opt) => ({
        value: opt.id,
        label: opt.label ?? opt.id,
        description: '',
      }));
    }
    return AI_MODEL_OPTIONS;
  }, [options]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return modelOptions;
    }

    return modelOptions.filter((option) =>
      `${option.label} ${option.value} ${option.description}`.toLowerCase().includes(query)
    );
  }, [search, modelOptions]);

  const displayLabel = useMemo(() => {
    if (options) {
      const match = modelOptions.find((o) => o.value === value);
      if (match) return match.label;
      return placeholder || value;
    }
    return getAIModelLabel(value);
  }, [options, modelOptions, value, placeholder]);

  const emptyMessage = emptyLabel || (options ? 'No models found.' : 'No OpenAI models found.');
  const searchText = searchPlaceholder || (options ? 'Search models...' : 'Search OpenAI models...');

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={searchText}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex w-full items-start rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    selected && 'bg-accent text-accent-foreground'
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 mt-0.5 h-4 w-4 shrink-0',
                      selected ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
