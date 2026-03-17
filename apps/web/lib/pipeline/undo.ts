import { PipelineStatus } from '@/lib/pipeline';

export interface UndoAction {
    id: string;
    type: 'status_change';
    skus: string[];
    fromStatus: PipelineStatus;
    toStatus: PipelineStatus;
    timestamp: number;
    revert: () => Promise<void>;
}

class UndoQueue {
    private static instance: UndoQueue;
    private queue: UndoAction[] = [];
    private listeners: ((action: UndoAction | null) => void)[] = [];

    private constructor() {}

    static getInstance(): UndoQueue {
        if (!UndoQueue.instance) {
            UndoQueue.instance = new UndoQueue();
        }
        return UndoQueue.instance;
    }

    add(action: Omit<UndoAction, 'id' | 'timestamp'>) {
        const newAction: UndoAction = {
            ...action,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
        };

        // We only keep the latest action for now as per UI requirements
        this.queue = [newAction];

        this.notify(newAction);

        // Auto-remove after 30 seconds
        setTimeout(() => {
            this.remove(newAction.id);
        }, 30000);

        return newAction;
    }

    remove(id: string) {
        const index = this.queue.findIndex(a => a.id === id);
        if (index !== -1) {
            this.queue.splice(index, 1);
            // If we removed the last one (or only one), notify with null
            if (this.queue.length === 0) {
                this.notify(null);
            }
        }
    }

    get(id: string) {
        return this.queue.find(a => a.id === id);
    }

    subscribe(listener: (action: UndoAction | null) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify(action: UndoAction | null) {
        this.listeners.forEach(l => l(action));
    }
}

export const undoQueue = UndoQueue.getInstance();
