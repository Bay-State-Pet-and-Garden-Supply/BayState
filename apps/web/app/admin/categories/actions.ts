'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';
import { ActionState } from '@/lib/types';
import { SupabaseClient } from '@supabase/supabase-js';

const categorySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    description: z.string().optional().nullable(),
    parent_id: z.string().optional().nullable(),
    display_order: z.coerce.number().default(0),
    image_url: z.string().optional().nullable(),
    is_featured: z.coerce.boolean().default(false),
    department_key: z.string().optional().nullable(),
    facet_profile: z.string().optional().nullable(),
    seo_title: z.string().optional().nullable(),
    seo_description: z.string().optional().nullable(),
    synonym_keywords: z.string().optional().nullable(),
    sort_order: z.coerce.number().default(0),
    is_active: z.coerce.boolean().default(true),
});

/**
 * Parse a comma-separated string into a text[] array.
 * Handles empty/null input gracefully.
 */
function parseSynonyms(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/**
 * Fetch parent category metadata for computing depth/breadcrumb.
 */
async function fetchParentMetadata(supabase: SupabaseClient, parentId: string | null): Promise<{ breadcrumb: string | null; depth: number | null; department_key: string | null }> {
    if (!parentId) return { breadcrumb: null, depth: null, department_key: null };
    const { data } = await supabase
        .from('categories')
        .select('breadcrumb, depth, department_key')
        .eq('id', parentId)
        .single();
    return data || { breadcrumb: null, depth: null, department_key: null };
}

/**
 * Recursively recompute depth and breadcrumb for a category and all its descendants.
 * Called after a category's name or parent changes.
 */
async function recomputeCategorySubtree(supabase: SupabaseClient, categoryId: string): Promise<void> {
    // Fetch all categories to build parent-child relationships
    const { data: allCats } = await supabase
        .from('categories')
        .select('id, name, parent_id, breadcrumb, depth, department_key');
    if (!allCats) return;

    interface CatRow { id: string; name: string; parent_id: string | null; breadcrumb: string | null; depth: number | null; department_key: string | null; }
    const catMap = new Map<string, CatRow>((allCats as CatRow[]).map(c => [c.id, c]));

    // Compute depth and breadcrumb by walking up to root
    function computeMetadata(id: string): { depth: number; breadcrumb: string } {
        const cat = catMap.get(id);
        if (!cat) return { depth: 0, breadcrumb: '' };

        let depth = 0;
        const parts: string[] = [cat.name];
        let current = cat;
        const visited = new Set<string>();
        visited.add(id);

        while (current.parent_id) {
            if (visited.has(current.parent_id)) break;
            visited.add(current.parent_id);
            const parent = catMap.get(current.parent_id);
            if (!parent) break;
            parts.unshift(parent.name);
            depth++;
            current = parent;
        }

        return { depth, breadcrumb: parts.join(' > ') };
    }

    // BFS to find all descendants
    const descendants: string[] = [];
    const queue = [categoryId];
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const cat of allCats) {
            if (cat.parent_id === currentId && cat.id !== categoryId) {
                descendants.push(cat.id);
                queue.push(cat.id);
            }
        }
    }

    // Recompute this category first
    const selfMeta = computeMetadata(categoryId);
    await supabase
        .from('categories')
        .update({ depth: selfMeta.depth, breadcrumb: selfMeta.breadcrumb })
        .eq('id', categoryId);

    // Update catMap with new values for downstream computations
    const selfCat = catMap.get(categoryId);
    if (selfCat) {
        selfCat.depth = selfMeta.depth;
        selfCat.breadcrumb = selfMeta.breadcrumb;
    }

    // Batch update descendants
    for (const descId of descendants) {
        const meta = computeMetadata(descId);
        await supabase
            .from('categories')
            .update({ depth: meta.depth, breadcrumb: meta.breadcrumb })
            .eq('id', descId);
    }
}


export async function createCategory(formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        parent_id: formData.get('parent_id') || null,
        display_order: formData.get('display_order'),
        image_url: formData.get('image_url'),
        is_featured: formData.get('is_featured') === 'true',
        department_key: formData.get('department_key') || null,
        facet_profile: formData.get('facet_profile') || null,
        seo_title: formData.get('seo_title') || null,
        seo_description: formData.get('seo_description') || null,
        synonym_keywords: formData.get('synonym_keywords') as string | null,
        sort_order: formData.get('sort_order'),
        is_active: formData.get('is_active') === 'false' ? false : true,
    };

    try {
        const validatedData = categorySchema.parse(rawData);

        // Compute depth and breadcrumb from parent
        const parentMeta = await fetchParentMetadata(supabase, validatedData.parent_id || null);
        const depth = parentMeta.depth !== null ? parentMeta.depth + 1 : 0;
        const breadcrumb = parentMeta.breadcrumb
            ? `${parentMeta.breadcrumb} > ${validatedData.name}`
            : validatedData.name;

        // Inherit department_key from parent if not explicitly set
        const departmentKey = validatedData.department_key || parentMeta.department_key || null;

        // Parse synonym_keywords from comma-separated string
        const synonyms = parseSynonyms(validatedData.synonym_keywords);

        // Keep sort_order in sync with display_order
        const sortOrder = validatedData.sort_order ?? validatedData.display_order;

        const { error } = await supabase
            .from('categories')
            .insert({
                name: validatedData.name,
                slug: validatedData.slug,
                description: validatedData.description,
                parent_id: validatedData.parent_id,
                display_order: validatedData.display_order,
                image_url: validatedData.image_url,
                is_featured: validatedData.is_featured,
                department_key: departmentKey,
                facet_profile: validatedData.facet_profile,
                seo_title: validatedData.seo_title,
                seo_description: validatedData.seo_description,
                synonym_keywords: synonyms,
                sort_order: sortOrder,
                depth,
                breadcrumb,
                is_active: validatedData.is_active,
            });

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to create category' };
        }

        revalidatePath('/admin/categories');
        revalidatePath('/');
        revalidatePath('/products');
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to create category' };
    }
}

export async function updateCategory(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        parent_id: formData.get('parent_id') || null,
        display_order: formData.get('display_order'),
        image_url: formData.get('image_url'),
        is_featured: formData.get('is_featured') === 'true',
        department_key: formData.get('department_key') || null,
        facet_profile: formData.get('facet_profile') || null,
        seo_title: formData.get('seo_title') || null,
        seo_description: formData.get('seo_description') || null,
        synonym_keywords: formData.get('synonym_keywords') as string | null,
        sort_order: formData.get('sort_order'),
        is_active: formData.get('is_active') === 'false' ? false : true,
    };

    try {
        const validatedData = categorySchema.parse(rawData);

        // Check if parent or name changed — triggers descendant recomputation
        const { data: existingCat } = await supabase
            .from('categories')
            .select('id, name, parent_id')
            .eq('id', id)
            .single();

        const parentChanged = existingCat && existingCat.parent_id !== validatedData.parent_id;
        const nameChanged = existingCat && existingCat.name !== validatedData.name;

        // Compute depth and breadcrumb from parent
        const parentMeta = await fetchParentMetadata(supabase, validatedData.parent_id || null);
        const depth = parentMeta.depth !== null ? parentMeta.depth + 1 : 0;
        const breadcrumb = parentMeta.breadcrumb
            ? `${parentMeta.breadcrumb} > ${validatedData.name}`
            : validatedData.name;

        // Inherit department_key from parent if not explicitly set
        const departmentKey = validatedData.department_key || parentMeta.department_key || null;

        // Parse synonym_keywords from comma-separated string
        const synonyms = parseSynonyms(validatedData.synonym_keywords);

        // Keep sort_order in sync with display_order
        const sortOrder = validatedData.sort_order ?? validatedData.display_order;

        const { error } = await supabase
            .from('categories')
            .update({
                name: validatedData.name,
                slug: validatedData.slug,
                description: validatedData.description,
                parent_id: validatedData.parent_id,
                display_order: validatedData.display_order,
                image_url: validatedData.image_url,
                is_featured: validatedData.is_featured,
                department_key: departmentKey,
                facet_profile: validatedData.facet_profile,
                seo_title: validatedData.seo_title,
                seo_description: validatedData.seo_description,
                synonym_keywords: synonyms,
                sort_order: sortOrder,
                depth,
                breadcrumb,
                is_active: validatedData.is_active,
            })
            .eq('id', id);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update category' };
        }

        // If name or parent changed, recompute descendant depths and breadcrumbs
        if (parentChanged || nameChanged) {
            await recomputeCategorySubtree(supabase, id);
        }

        revalidatePath('/admin/categories');
        revalidatePath('/');
        revalidatePath('/products');
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update category' };
    }
}

export async function deleteCategory(id: string): Promise<ActionState> {
    const supabase = await createClient();

    // Soft-delete: set is_active = false instead of deleting
    // This preserves legacy category references and allows undo
    const { error } = await supabase
        .from('categories')
        .update({ is_active: false })
        .eq('id', id);

    if (error) {
        console.error('Database Error:', error);
        return { success: false, error: 'Failed to delete category' };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/', 'layout');
    return { success: true };
}
