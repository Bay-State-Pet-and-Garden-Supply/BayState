'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Technical name → Friendly display label
const STATUS_LABELS: Record<string, string> = {
    '': 'All',
    staging: 'Imported',
    scraped: 'Enhanced',
    consolidated: 'Ready for Review',
    approved: 'Verified',
    published: 'Live',
    failed: 'Failed',
};

// Display order: empty string = All
const STATUS_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'staging', label: 'Imported' },
    { value: 'scraped', label: 'Enhanced' },
    { value: 'consolidated', label: 'Ready for Review' },
    { value: 'approved', label: 'Verified' },
    { value: 'published', label: 'Live' },
    { value: 'failed', label: 'Failed' },
] as const;

export type StatusFilterValue = '' | 'staging' | 'scraped' | 'consolidated' | 'approved' | 'published' | 'failed';

export interface StatusCount {
    total: number;
    [key: string]: number;
}

interface StatusFilterProps {
    counts: StatusCount;
    className?: string;
}

export function StatusFilter({ counts, className }: StatusFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentStatus = searchParams.get('status') || '';

    const handleStatusChange = (status: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (status === '' || !status) {
            params.delete('status');
        } else {
            params.set('status', status);
        }
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const getCountForStatus = (status: string): number => {
        if (status === '') {
            return counts.total;
        }
        return counts[status] ?? 0;
    };

    const currentLabel = STATUS_LABELS[currentStatus] || 'All';
    const currentCount = getCountForStatus(currentStatus);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'gap-2 border-dashed',
                        currentStatus && 'bg-green-50 border-green-200 text-green-700',
                        className
                    )}
                >
                    <Filter className="h-4 w-4" />
                    <span>Status</span>
                    {currentStatus && (
                        <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium">
                            {currentLabel}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                {STATUS_OPTIONS.map((option) => {
                    const count = getCountForStatus(option.value);
                    const isSelected = currentStatus === option.value;

                    return (
                        <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleStatusChange(option.value)}
                            className={cn(
                                'flex items-center justify-between gap-2 cursor-pointer',
                                isSelected && 'bg-accent font-medium'
                            )}
                        >
                            <span>{option.label}</span>
                            <span
                                className={cn(
                                    'text-muted-foreground text-xs',
                                    isSelected && 'text-foreground'
                                )}
                            >
                                {count.toLocaleString()}
                            </span>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
