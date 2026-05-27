export interface IndexedDomain {
  id: number;
  normalizedDomain: string;
  officialWebsiteUrl?: string;
  brandName?: string;
  createdAt: string;
  updatedAt: string;
  lastSitemapCheckedAt?: string;
  lastCrawlStartedAt?: string;
  lastCrawlCompletedAt?: string;
}

export interface DiscoveredDomainUrl {
  url: string;
  urlType?: string;
  discoveredFrom?: string;
  isProductLike?: boolean;
}

export interface PageIndexStats {
  domainCount: number;
  urlCount: number;
  fetchedUrlCount: number;
  productLikeUrlCount: number;
  pageFactsCount: number;
}

export interface UpsertDomainInput {
  normalizedDomain: string;
  officialWebsiteUrl?: string;
  brandName?: string;
}

export interface UpsertPageFactsInput {
  url: string;
  title?: string;
  description?: string;
  images?: string[];
  categories?: string[];
  attributes?: Record<string, unknown>;
  upcs?: string[];
  brand?: string;
  confidence?: number;
  evidence?: string[];
  jsonld?: Record<string, unknown>[];
}

export interface IndexedPageCandidate {
  url: string;
  title?: string;
  description?: string;
  snippet?: string;
  isProductLike: boolean;
  discoveredFrom?: string;
  confidence: number;
  upcs: string[];
}
