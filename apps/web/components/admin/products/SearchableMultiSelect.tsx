'use client';

import * as React from 'react';
import { Check, Search, X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

interface Option {
  id: string;
  name: string;
}

interface SearchableMultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  onCreate?: (name: string) => Promise<void>;
  creating?: boolean;
  emptyMessage?: string;
}

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  onCreate,
  creating = false,
  emptyMessage = "No items found.",
}: SearchableMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleItem = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((item) => item !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const removeItem = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    onChange(selected.filter((item) => item !== name));
  };

  const handleCreate = async () => {
    if (onCreate && search.trim()) {
      await onCreate(search.trim());
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          asChild
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal min-h-10 h-auto px-3 py-2 text-left flex flex-wrap gap-1.5"
        >
          <div>
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="gap-1 px-1.5 py-0.5"
                  >
                    {item}
                    <button
                      type="button"
                      className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onClick={(e) => removeItem(e, item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          removeItem(e as any, item);
                        }
                      }}
                    >
                      <X className="size-3 text-muted-foreground hover:text-foreground" />
                      <span className="sr-only">Remove {item}</span>
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <Search className="ml-auto size-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = selected.includes(option.name);
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => toggleItem(option.name)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.name}
                  </div>
                );
              })
            ) : (
              !onCreate && <div className="p-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            )}
          </div>
          {onCreate && search.trim() && !options.find((opt) => opt.name.toLowerCase() === search.toLowerCase().trim()) && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs font-normal"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <Spinner className="mr-2 size-3" />
                ) : (
                  <Plus className="mr-2 size-3" />
                )}
                {creating ? "Creating..." : `Create "${search.trim()}"`}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
