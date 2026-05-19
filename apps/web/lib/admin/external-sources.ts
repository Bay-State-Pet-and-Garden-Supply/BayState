type MaybeSingleResponse = PromiseLike<{
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}>;

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => MaybeSingleResponse;
      };
    };
  };
};

const EXTERNAL_SOURCE_KEYS = [
  'shopsite',
  'integra',
  'web',
  'manual',
  'import',
] as const;

export type ExternalSourceKey = (typeof EXTERNAL_SOURCE_KEYS)[number];

const EXTERNAL_SOURCE_DEFINITIONS: Record<
  ExternalSourceKey,
  {
    name: string;
    sourceType: string;
    sourceSystem: string;
  }
> = {
  shopsite: {
    name: 'ShopSite',
    sourceType: 'shopsite',
    sourceSystem: 'shopsite_15',
  },
  integra: {
    name: 'Integra Register',
    sourceType: 'integra',
    sourceSystem: 'integra_register',
  },
  web: {
    name: 'Bay State Web Storefront',
    sourceType: 'web',
    sourceSystem: 'web_storefront',
  },
  manual: {
    name: 'Manual Admin Entry',
    sourceType: 'manual',
    sourceSystem: 'manual_admin',
  },
  import: {
    name: 'Generic Import',
    sourceType: 'import',
    sourceSystem: 'generic_import',
  },
};

export interface ExternalSourceRecord {
  id: string;
  key: ExternalSourceKey;
  name: string;
  source_type: string;
  source_system: string;
  is_active?: boolean | null;
}

async function getExternalSourceByKey(
  supabase: SupabaseLike,
  key: ExternalSourceKey,
): Promise<ExternalSourceRecord | null> {
  const { data, error } = await supabase
    .from('external_sources')
    .select('id, key, name, source_type, source_system, is_active')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`[ExternalSources] Failed to resolve ${key}:`, error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return data as unknown as ExternalSourceRecord;
}

export async function getExternalSourceIdByKey(
  supabase: SupabaseLike,
  key: ExternalSourceKey,
): Promise<string | null> {
  const source = await getExternalSourceByKey(supabase, key);
  return source?.id ?? null;
}
