import { applyResults } from '../lib/consolidation/batch-service';

function getBatchIdsFromArgs(): string[] {
    return process.argv
        .slice(2)
        .map((value) => value.trim())
        .filter(Boolean);
}

function isBatchError(
    result: Awaited<ReturnType<typeof applyResults>>,
): result is { success: false; error: string } {
    return 'success' in result && result.success === false;
}

async function applyAll(batchIds: string[]) {
    if (batchIds.length === 0) {
        console.error('Usage: bun scripts/apply-batches.ts <batch-id> [batch-id...]');
        process.exit(1);
    }

    console.log(`Applying results for ${batchIds.length} batches...`);

    for (const batchId of batchIds) {
        try {
            console.log(`Applying ${batchId}...`);
            const result = await applyResults(batchId);

            if (isBatchError(result)) {
                console.error(`  Failed to apply ${batchId}: ${result.error}`);
                continue;
            }

            console.log(`  Successfully applied ${batchId}:`);
            console.log(`    Success: ${result.success_count}, Errors: ${result.error_count}, Total: ${result.total}`);
        } catch (error) {
            console.error(`  Unexpected error applying ${batchId}:`, error);
        }
    }

    console.log('Apply complete.');
}

applyAll(getBatchIdsFromArgs()).catch(console.error);
