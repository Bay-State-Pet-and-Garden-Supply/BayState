import { createPublicClient } from '@/lib/supabase/server';

export interface FacetDefinition {
  id: string;
  name: string;
  slug: string;
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
    values: (facetValues || [])
      .filter((v) => v.facet_definition_id === def.id)
      .map((v) => ({
        id: v.id,
        value: v.value,
        slug: v.slug,
      })),
  }));
}
