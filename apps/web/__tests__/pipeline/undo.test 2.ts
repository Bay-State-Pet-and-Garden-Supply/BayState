import { undoQueue } from '@/lib/pipeline/undo';

describe('UndoQueue', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // Clear queue by accessing private property or just relying on new actions
        // Since it's a singleton, we might need to be careful.
        // But for this test, we can just add new items.
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should add an action to the queue', () => {
        const action = {
            type: 'status_change' as const,
            skus: ['SKU-123'],
            fromStatus: 'staging' as const,
            toStatus: 'scraped' as const,
            revert: jest.fn().mockResolvedValue(undefined),
        };

        const addedAction = undoQueue.add(action);

        expect(addedAction).toBeDefined();
        expect(addedAction.id).toBeDefined();
        expect(undoQueue.get(addedAction.id)).toBeDefined();
    });

    it('should remove action after 30 seconds', () => {
        const action = {
            type: 'status_change' as const,
            skus: ['SKU-123'],
            fromStatus: 'staging' as const,
            toStatus: 'scraped' as const,
            revert: jest.fn().mockResolvedValue(undefined),
        };

        const addedAction = undoQueue.add(action);
        expect(undoQueue.get(addedAction.id)).toBeDefined();

        jest.advanceTimersByTime(30000);

        expect(undoQueue.get(addedAction.id)).toBeUndefined();
    });

    it('should notify subscribers when action is added', () => {
        const listener = jest.fn();
        const unsubscribe = undoQueue.subscribe(listener);

        const action = {
            type: 'status_change' as const,
            skus: ['SKU-123'],
            fromStatus: 'staging' as const,
            toStatus: 'scraped' as const,
            revert: jest.fn().mockResolvedValue(undefined),
        };

        undoQueue.add(action);

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            skus: ['SKU-123'],
            type: 'status_change'
        }));

        unsubscribe();
    });
});
