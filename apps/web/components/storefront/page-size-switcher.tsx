'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageSizeSwitcherProps {
  currentLimit: number;
}

export function PageSizeSwitcher({ currentLimit }: PageSizeSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLimitChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', value);
    params.set('page', '1'); // Reset to page 1 when changing page size
    router.push(`/products?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-zinc-500 whitespace-nowrap">Show:</span>
      <Select value={String(currentLimit)} onValueChange={handleLimitChange}>
        <SelectTrigger className="w-[80px] h-9 text-sm font-medium border-zinc-200">
          <SelectValue placeholder={String(currentLimit)} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="12">12</SelectItem>
          <SelectItem value="24">24</SelectItem>
          <SelectItem value="48">48</SelectItem>
          <SelectItem value="96">96</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
