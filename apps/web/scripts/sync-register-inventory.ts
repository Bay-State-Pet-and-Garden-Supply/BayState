import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import {
    parseRegisterRows,
    parseRegisterWorkbook,
    type RegisterWorkbookProduct,
} from '../lib/admin/register-file';
import {
    hasRegisterOdbcConfiguration,
    resolveRegisterSyncSource,
    type RegisterSyncSource,
} from '../lib/admin/register-source';
import {
    DEFAULT_REGISTER_SYNC_FIELDS,
    normalizeRegisterSyncFields,
    planRegisterSync,
    type RegisterSyncExistingProduct,
    type RegisterSyncUpdate,
} from '../lib/admin/register-sync';
import type { SyncResult } from '../lib/admin/migration/types';

const DEFAULT_FILE_GLOB = '..\\..\\temp\\inventory*.xlsx';
const PRODUCT_BATCH_SIZE = 500;
const SYNC_TYPE = 'register_inventory';

interface RegisterSnapshot {
    source: RegisterSyncSource;
    sourceLabel: string;
    products: RegisterWorkbookProduct[];
    workspacePath?: string; // Path to temp dir where files are stored
}

function getArgValue(name: string): string | undefined {
    const exact = process.argv.find((arg) => arg === `--${name}`);
    if (exact) {
        const next = process.argv[process.argv.indexOf(exact) + 1];
        return next && !next.startsWith('--') ? next : 'true';
    }

    const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return prefixed?.split('=').slice(1).join('=');
}

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
        return false;
    }

    throw new Error(`Invalid boolean value: ${value}`);
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

function resolvePathFromCwd(candidate: string): string {
    return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

function wildcardToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const source = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
    return new RegExp(source, 'i');
}

async function resolveWorkbookPath(): Promise<string> {
    const directFilePath = getArgValue('file')?.trim() || process.env.REGISTER_SYNC_FILE_PATH?.trim();
    if (directFilePath) {
        return resolvePathFromCwd(directFilePath);
    }

    const filePattern =
        getArgValue('file-glob')?.trim() ||
        process.env.REGISTER_SYNC_FILE_GLOB?.trim() ||
        DEFAULT_FILE_GLOB;

    const absolutePattern = resolvePathFromCwd(filePattern);
    const directory = dirname(absolutePattern);
    const fileNamePattern = basename(absolutePattern);
    const matcher = wildcardToRegExp(fileNamePattern);

    const entries = await readdir(directory, { withFileTypes: true });
    const matches: Array<{ path: string; modifiedAt: number }> = [];

    for (const entry of entries) {
        if (!entry.isFile() || !matcher.test(entry.name)) {
            continue;
        }

        const candidatePath = resolve(directory, entry.name);
        const candidateStats = await stat(candidatePath);
        matches.push({
            path: candidatePath,
            modifiedAt: candidateStats.mtimeMs,
        });
    }

    if (matches.length === 0) {
        throw new Error(
            `No register workbook matched "${filePattern}". Set --file, --file-glob, REGISTER_SYNC_FILE_PATH, or REGISTER_SYNC_FILE_GLOB.`,
        );
    }

    matches.sort((left, right) => right.modifiedAt - left.modifiedAt);
    return matches[0].path;
}

function exportRegisterSnapshotToJson(
    outputPath: string,
    rowLimit?: number,
): void {
    const scriptPath = resolve(process.cwd(), 'scripts', 'export-register-odbc.ps1');
    const args = [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-OutputPath',
        outputPath,
    ];

    if (rowLimit && rowLimit > 0) {
        args.push('-RowLimit', String(rowLimit));
    }

    const result = spawnSync(
        'pwsh',
        args,
        {
            env: process.env,
            encoding: 'utf8',
            stdio: 'inherit',
        },
    );

    if (result.error) {
        throw new Error(
            `Failed to execute register ODBC export: ${result.error.message}`,
        );
    }

    if (result.status !== 0) {
        throw new Error(
            `Register ODBC export failed with exit code ${result.status}.`,
        );
    }
}

async function loadRegisterProductsFromWorkbook(
    limit?: number,
): Promise<RegisterSnapshot> {
    const filePath = await resolveWorkbookPath();
    const workbookBuffer = await readFile(filePath);
    const parsedProducts = parseRegisterWorkbook(
        bufferToArrayBuffer(workbookBuffer),
    );

    return {
        source: 'workbook',
        sourceLabel: filePath,
        products: limit ? parsedProducts.slice(0, limit) : parsedProducts,
    };
}

async function loadRegisterProductsFromOdbc(
    limit?: number,
): Promise<RegisterSnapshot> {
    if (!hasRegisterOdbcConfiguration()) {
        throw new Error(
            'Missing register ODBC configuration. Set REGISTER_ODBC_CONNECTION_STRING (preferred), REGISTER_ODBC_DSN, or REGISTER_ODBC_DRIVER plus REGISTER_ODBC_SERVER.',
        );
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'register-sync-'));
    const inventoryPath = join(tempDirectory, 'register-inventory.json');

    try {
        // export-register-odbc.ps1 now exports both inventory and sales if OutputPath is a directory
        exportRegisterSnapshotToJson(tempDirectory, limit);

        const rawSnapshot = await readFile(inventoryPath, 'utf8');
        const parsedRows = JSON.parse(rawSnapshot) as unknown;
        if (!Array.isArray(parsedRows)) {
            throw new Error('Register ODBC export returned an invalid payload for inventory.');
        }

        const products = parseRegisterRows(
            parsedRows as Array<Record<string, unknown>>,
        );

        return {
            source: 'odbc',
            sourceLabel: 'live ODBC source',
            products,
            workspacePath: tempDirectory
        };
    } catch (err) {
        await rm(tempDirectory, { recursive: true, force: true });
        throw err;
    }
}

async function syncSales(supabase: SupabaseClient, workspacePath: string, dryRun: boolean) {
    const salesPath = join(workspacePath, 'register-sales.json');
    let salesRaw: string;
    try {
        salesRaw = await readFile(salesPath, 'utf-8');
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            console.log('No register-sales.json found, skipping sales sync.');
            return { inserted: 0, failed: 0 };
        }
        throw e;
    }

    const sales = JSON.parse(salesRaw);
    console.log(`Loaded ${sales.length} sales records for sync.`);

    if (dryRun) {
        console.log(`[DRY RUN] Would sync ${sales.length} sales records.`);
        return { inserted: sales.length, failed: 0 };
    }

    let inserted = 0;
    let failed = 0;

    // Batching sales upserts for better performance
    const salesBatchSize = 100;
    for (let i = 0; i < sales.length; i += salesBatchSize) {
        const batch = sales.slice(i, i + salesBatchSize);
        const mappedBatch = batch.map((sale: any) => {
            // Helper to parse the peculiar "/Date(1577941200000)/" format
            let tranDateStr = sale.TRAN_DATE;
            let dateObj = new Date();
            if (tranDateStr && tranDateStr.startsWith('/Date(')) {
                const ms = parseInt(tranDateStr.replace(/[^0-9]/g, ''), 10);
                dateObj = new Date(ms);
            }

            // Create a unique ID for the upsert since INVOICE_NO is often 0
            // Example: "INT-1577941200000-80351-33-1"
            const orderNumber = `INT-${dateObj.getTime()}-${sale.TRAN_TIME}-${sale.CASHIER}-${sale.REGISTER}`;

            return {
                order_number: orderNumber,
                source: 'integra',
                status: 'completed',
                customer_name: 'In-Store Customer',
                customer_email: 'instore@baystate.com',
                subtotal: Number(sale.SALE_TOTAL) - Number(sale.SALE_TAX),
                tax: Number(sale.SALE_TAX),
                total: Number(sale.SALE_TOTAL),
                created_at: dateObj.toISOString(),
                payment_method: 'in_store',
                notes: `Cashier: ${sale.CASHIER}, Register: ${sale.REGISTER}`
            };
        });

        const { error } = await supabase
            .from('orders')
            .upsert(mappedBatch, { onConflict: 'order_number' });

        if (error) {
            console.error(`Failed to upsert sales batch starting at ${i}:`, error.message);
            failed += batch.length;
        } else {
            inserted += batch.length;
        }
    }

    console.log(`Sales Sync Complete. Upserted: ${inserted}, Failed: ${failed}`);
    return { inserted, failed };
}

async function startLog(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
        .from('migration_log')
        .insert({
            sync_type: SYNC_TYPE,
            status: 'running',
        } as never)
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create migration log:', error.message);
        return null;
    }

    return data?.id ?? null;
}

async function updateLogProgress(
    supabase: SupabaseClient,
    logId: string,
    result: SyncResult,
): Promise<void> {
    const { error } = await supabase
        .from('migration_log')
        .update({
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            errors: result.errors,
        } as never)
        .eq('id', logId);

    if (error) {
        console.error('Failed to update register sync progress:', error.message);
    }
}

async function completeLog(
    supabase: SupabaseClient,
    logId: string,
    result: SyncResult,
): Promise<void> {
    const { error } = await supabase
        .from('migration_log')
        .update({
            completed_at: new Date().toISOString(),
            status: result.success ? 'completed' : 'failed',
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            duration_ms: result.duration,
            errors: result.errors,
        } as never)
        .eq('id', logId);

    if (error) {
        console.error('Failed to complete register sync log:', error.message);
    }
}

async function fetchExistingProducts(
    supabase: SupabaseClient,
    skus: string[],
): Promise<RegisterSyncExistingProduct[]> {
    const uniqueSkus = Array.from(new Set(skus));
    const products: RegisterSyncExistingProduct[] = [];

    for (let start = 0; start < uniqueSkus.length; start += PRODUCT_BATCH_SIZE) {
        const skuBatch = uniqueSkus.slice(start, start + PRODUCT_BATCH_SIZE);
        const { data, error } = await supabase
            .from('products')
            .select('id, sku, name, slug, price, quantity, stock_status')
            .in('sku', skuBatch);

        if (error) {
            throw new Error(`Failed to fetch existing products: ${error.message}`);
        }

        for (const product of data || []) {
            if (!product.sku) {
                continue;
            }

            products.push({
                id: product.id,
                sku: product.sku,
                name: product.name,
                slug: product.slug,
                price: Number(product.price),
                quantity: product.quantity ?? 0,
                stock_status: product.stock_status ?? 'in_stock',
            });
        }
    }

    return products;
}

async function applyUpdates(
    supabase: SupabaseClient,
    updates: RegisterSyncUpdate[],
): Promise<number> {
    let appliedUpdates = 0;

    for (let start = 0; start < updates.length; start += PRODUCT_BATCH_SIZE) {
        const updateBatch = updates.slice(start, start + PRODUCT_BATCH_SIZE);
        const { error } = await supabase
            .from('products')
            .upsert(updateBatch, { onConflict: 'id' });

        if (error) {
            throw new Error(`Failed to apply register updates: ${error.message}`);
        }

        appliedUpdates += updateBatch.length;
    }

    return appliedUpdates;
}

function buildSyncSummary(
    source: RegisterSyncSource,
    sourceLabel: string,
    dryRun: boolean,
    fields: string[],
    result: SyncResult,
    plan: ReturnType<typeof planRegisterSync>,
    appliedUpdates: number,
    salesResult?: { inserted: number; failed: number }
) {
    return {
        success: result.success,
        dryRun,
        source,
        sourceLabel,
        fields,
        processed: plan.totalInFile,
        matchedProducts: plan.matchedProducts,
        unchangedProducts: plan.unchangedProducts,
        updatesPlanned: plan.updates.length,
        updatesApplied: appliedUpdates,
        missingOnWebsite: plan.missingProducts.length,
        salesSynced: salesResult?.inserted || 0,
        salesFailed: salesResult?.failed || 0,
        missingPreview: plan.missingProducts.slice(0, 10).map((product) => ({
            sku: product.sku,
            name: product.name,
            price: product.price,
            quantityOnHand: product.quantityOnHand,
        })),
        preview: plan.previews.slice(0, 10),
        duration: result.duration,
    };
}

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const dryRunFlag = hasFlag('dry-run');
    const applyFlag = hasFlag('apply');
    const envDryRun = parseOptionalBoolean(process.env.REGISTER_SYNC_DRY_RUN);
    const dryRun = applyFlag ? false : dryRunFlag ? true : envDryRun ?? true;

    const fieldArg = getArgValue('fields') ?? process.env.REGISTER_SYNC_FIELDS;
    const fields = normalizeRegisterSyncFields(
        fieldArg ?? DEFAULT_REGISTER_SYNC_FIELDS,
    );
    const source = resolveRegisterSyncSource(
        getArgValue('source') ?? process.env.REGISTER_SYNC_SOURCE,
    );

    const limitArg = getArgValue('limit');
    const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
    if (limitArg && Number.isNaN(limit)) {
        throw new Error(`Invalid --limit value: ${limitArg}`);
    }

    const startedAt = Date.now();

    const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    console.log('Starting register data sync (inventory + sales)...');
    console.log(`Source: ${source}`);
    console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Fields: ${fields.join(', ')}`);

    const logId = await startLog(supabase);

    try {
        const registerSnapshot =
            source === 'odbc'
                ? await loadRegisterProductsFromOdbc(limit)
                : await loadRegisterProductsFromWorkbook(limit);
        const registerProducts = registerSnapshot.products;

        if (registerSnapshot.source === 'odbc') {
            console.log('Using live register ODBC source');
        } else {
            console.log(`Using workbook: ${registerSnapshot.sourceLabel}`);
        }

        // 1. Sync Inventory
        const existingProducts = await fetchExistingProducts(
            supabase,
            registerProducts.map((product) => product.sku),
        );
        const plan = planRegisterSync(registerProducts, existingProducts, fields);

        let appliedUpdates = 0;
        if (!dryRun && plan.updates.length > 0) {
            appliedUpdates = await applyUpdates(supabase, plan.updates);
        }

        // 2. Sync Sales (if ODBC)
        let salesResult = { inserted: 0, failed: 0 };
        if (registerSnapshot.source === 'odbc' && registerSnapshot.workspacePath) {
            console.log('Syncing in-store sales records...');
            salesResult = await syncSales(supabase, registerSnapshot.workspacePath, dryRun);
        }

        const result: SyncResult = {
            success: true,
            processed: plan.totalInFile,
            created: 0,
            updated: dryRun ? plan.updates.length : appliedUpdates,
            failed: salesResult.failed,
            errors: [],
            duration: Date.now() - startedAt,
        };

        if (logId) {
            await updateLogProgress(supabase, logId, result);
            await completeLog(supabase, logId, result);
        }

        console.log(
            JSON.stringify(
                buildSyncSummary(
                    registerSnapshot.source,
                    registerSnapshot.sourceLabel,
                    dryRun,
                    fields,
                    result,
                    plan,
                    appliedUpdates,
                    salesResult
                ),
                null,
                2,
            ),
        );

        // Cleanup workspace if it was created
        if (registerSnapshot.workspacePath) {
            await rm(registerSnapshot.workspacePath, { recursive: true, force: true });
        }

    } catch (error) {
        const result: SyncResult = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [
                {
                    record: 'N/A',
                    error:
                        error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString(),
                },
            ],
            duration: Date.now() - startedAt,
        };

        if (logId) {
            await completeLog(supabase, logId, result);
        }

        throw error;
    }
}

main().catch((error) => {
    console.error('Register sync failed:', error);
    process.exit(1);
});
