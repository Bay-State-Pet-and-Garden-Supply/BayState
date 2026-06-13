/**
 * Facet Vocabulary Helper
 * 
 * Fetches, caches, and validates product detail facet values against the canonical 
 * database vocabulary (facet_definitions and facet_values tables).
 */

import { createAdminClient } from '@/lib/supabase/server';

export interface FacetVocabulary {
    [definitionSlug: string]: string[];
}

let cachedVocabulary: Map<string, string[]> | null = null;
let cachedVocabularyExpiresAt = 0;
const VOCABULARY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// Helper to escape string for regex
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize a definition slug to the format used in database (hyphens, lowercase)
export function normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Get the cached vocabulary synchronously if it is loaded and not expired.
 */
export function getCachedVocabularySync(): Map<string, string[]> | null {
    if (cachedVocabulary && Date.now() < cachedVocabularyExpiresAt) {
        return cachedVocabulary;
    }
    return null;
}

/**
 * Fetch and cache the canonical facet vocabulary from Supabase.
 */
export async function getCanonicalFacetValues(): Promise<Map<string, string[]>> {
    if (cachedVocabulary && Date.now() < cachedVocabularyExpiresAt) {
        return cachedVocabulary;
    }

    const supabase = await createAdminClient();

    // Query active (non-deprecated) facet definitions
    const { data: defs, error: defError } = await supabase
        .from('facet_definitions')
        .select('id, slug')
        .eq('is_deprecated', false);

    if (defError || !defs) {
        console.error('[FacetVocabulary] Failed to fetch facet definitions:', defError);
        return cachedVocabulary || new Map();
    }

    // Query all facet values
    const { data: vals, error: valError } = await supabase
        .from('facet_values')
        .select('facet_definition_id, value')
        .order('value');

    if (valError || !vals) {
        console.error('[FacetVocabulary] Failed to fetch facet values:', valError);
        return cachedVocabulary || new Map();
    }

    const definitionById = new Map<string, string>();
    for (const def of defs) {
        definitionById.set(def.id, normalizeSlug(def.slug));
    }

    const vocabMap = new Map<string, string[]>();
    
    // Initialize array for each definition slug
    for (const def of defs) {
        vocabMap.set(normalizeSlug(def.slug), []);
    }

    for (const val of vals) {
        const slug = definitionById.get(val.facet_definition_id);
        if (slug) {
            const list = vocabMap.get(slug) || [];
            list.push(val.value);
            vocabMap.set(slug, list);
        }
    }

    cachedVocabulary = vocabMap;
    cachedVocabularyExpiresAt = Date.now() + VOCABULARY_CACHE_TTL_MS;

    return vocabMap;
}

/**
 * Reset vocabulary cache (e.g. for testing)
 */
function clearVocabularyCache(): void {
    cachedVocabulary = null;
    cachedVocabularyExpiresAt = 0;
}

/**
 * Clean up a raw value by removing duplicate/concatenated repeats, e.g. "AdultAdult" -> "Adult".
 */
export function removeRepeatedSubstrings(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) return trimmed;
    
    // Check if the string can be split into two identical halves
    const len = trimmed.length;
    if (len % 2 === 0) {
        const half = len / 2;
        const firstHalf = trimmed.slice(0, half);
        const secondHalf = trimmed.slice(half);
        if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
            return trimmed.slice(0, half); // Return the first half retaining original casing
        }
    }
    return trimmed;
}

/**
 * Validate a raw facet value against the canonical vocabulary.
 * Returns the canonical value if found/mapped, or null if no valid match.
 */
export function validateFacetValue(
    definitionSlug: string,
    rawValue: string | null | undefined,
    vocabulary: Map<string, string[]>
): string | null {
    if (!rawValue) return null;
    
    // Pre-clean value for known duplication issues (e.g. "AdultAdult" -> "Adult")
    let cleanedValue = removeRepeatedSubstrings(rawValue.trim());
    if (!cleanedValue) return null;

    const normSlug = normalizeSlug(definitionSlug);
    const allowedValues = vocabulary.get(normSlug);
    if (!allowedValues || allowedValues.length === 0) {
        // If there are no canonical values in DB yet, return the cleaned value as-is
        return cleanedValue;
    }

    const lowerCleaned = cleanedValue.toLowerCase();

    // 1. Exact case-insensitive match
    for (const allowed of allowedValues) {
        if (allowed.toLowerCase() === lowerCleaned) {
            return allowed;
        }
    }

    // 2. Sort allowed values by length descending to match longer/more specific phrases first
    const sortedAllowed = [...allowedValues].sort((a, b) => b.length - a.length);

    // 3. Check for phrase matching (whole words).
    // E.g., rawValue = "Harvest Chicken" and allowed has "Chicken"
    for (const allowed of sortedAllowed) {
        // Skip short words to avoid false positive partial matching (like matching "I" in "Fish")
        if (allowed.length < 3) continue;

        try {
            const regex = new RegExp(`\\b${escapeRegExp(allowed)}\\b`, 'i');
            if (regex.test(cleanedValue)) {
                return allowed;
            }
        } catch (e) {
            // Fallback to simple substring with word boundaries if RegExp fails
            if (lowerCleaned.includes(allowed.toLowerCase())) {
                return allowed;
            }
        }
    }

    // 4. Try reverse matching: see if any allowed value contains the cleanedValue as a whole word.
    // E.g., rawValue = "Chicken" and allowed has "Chicken Recipe"
    for (const allowed of sortedAllowed) {
        if (cleanedValue.length < 3) continue;
        try {
            const regex = new RegExp(`\\b${escapeRegExp(cleanedValue)}\\b`, 'i');
            if (regex.test(allowed)) {
                return allowed;
            }
        } catch (e) {
             if (allowed.toLowerCase().includes(lowerCleaned)) {
                 return allowed;
             }
        }
    }

    // No match found
    return null;
}
