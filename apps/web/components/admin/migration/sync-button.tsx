'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

interface SyncButtonProps {
    label: string;
    onClick?: () => void;
}

export function SyncButton({ label, onClick }: SyncButtonProps) {
    const { pending } = useFormStatus();

    return (
        <Button
            className="w-full justify-between"
            variant="outline"
            disabled={pending}
            onClick={onClick}
            type="submit"
        >
            <span className="flex items-center gap-2">
                {label}
            </span>
            {pending ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            ) : (
                <RefreshCw className="h-4 w-4 ml-2" />
            )}
        </Button>
    );
}
