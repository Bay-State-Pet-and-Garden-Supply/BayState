'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
    id: string | number;
    count: number;
    toStatus: string;
    onUndo: () => Promise<void>;
}

export function UndoToast({ id, count, toStatus, onUndo }: UndoToastProps) {
    const [timeLeft, setTimeLeft] = useState(30);
    const [isUndoing, setIsUndoing] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const handleUndo = async () => {
        setIsUndoing(true);
        try {
            await onUndo();
            toast.dismiss(id);
            toast.success('Changes reverted');
        } catch (error) {
            console.error('Undo failed:', error);
            toast.error('Failed to undo changes');
            setIsUndoing(false);
        }
    };

    return (
        <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                    Moved {count} items to {toStatus}
                </p>
                <p className="text-xs text-muted-foreground">
                    Undo available for {timeLeft}s
                </p>
            </div>
            <button
                onClick={handleUndo}
                disabled={isUndoing}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                <Undo2 className="h-4 w-4" />
                {isUndoing ? 'Undoing...' : 'Undo'}
            </button>
        </div>
    );
}
