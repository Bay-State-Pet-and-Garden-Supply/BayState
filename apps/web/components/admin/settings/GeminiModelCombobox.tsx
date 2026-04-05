'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  GEMINI_MODEL_OPTIONS,
  getGeminiModelLabel,
} from '@/lib/ai-scraping/models';

interface GeminiModelComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export function GeminiModelCombobox({
  id,
  value,
  onChange,
}: GeminiModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return GEMINI_MODEL_OPTIONS;
    }

    return GEMINI_MODEL_OPTIONS.filter((option) =>
      `${option.label} ${option.value} ${option.description}`.toLowerCase().includes(query)
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{getGeminiModelLabel(value)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search Gemini models..."
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
                    setSearch('');
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
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No Gemini models found.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
