import { createPublicClient } from '@/lib/supabase/server';

export interface FacetDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  facet_profile?: string[] | null;
  is_deprecated?: boolean | null;
  values: FacetValue[];
}

export interface FacetValue {
  id: string;
  value: string;
  slug: string;
  count?: number;
}

/**
 * Fetch all available facet definitions and their values.
 * In a fully optimized system, this would be scoped to the current category/search result set.
 */
export async function getDynamicFacets(): Promise<FacetDefinition[]> {
  const supabase = createPublicClient();

  const { data: facetDefs, error: defError } = await supabase
    .from('facet_definitions')
    .select('*')
    .eq('is_deprecated', false)
    .order('name');

  if (defError) {
    console.error('Error fetching facet definitions:', defError);
    return [];
  }

  const { data: facetValues, error: valError } = await supabase
    .from('facet_values')
    .select('*')
    .order('value');

  if (valError) {
    console.error('Error fetching facet values:', valError);
    return [];
  }

  // Map values to their definitions
  return (facetDefs || []).map((def) => ({
    id: def.id,
    name: def.name,
    slug: def.slug,
    description: def.description ?? null,
    facet_profile: def.facet_profile ?? null,
    is_deprecated: def.is_deprecated ?? null,
    values: (facetValues || [])
      .filter((v) => v.facet_definition_id === def.id)
      .map((v) => ({
        id: v.id,
        value: v.value,
        slug: v.slug,
      })),
  }));
}
