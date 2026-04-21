export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  official_domains: string[];
  preferred_domains: string[];
  created_at: string;
}

export interface BrandActionState {
  success: boolean;
  error?: string;
  brand?: Brand;
}
