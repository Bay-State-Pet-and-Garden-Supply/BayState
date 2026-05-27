const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "srsltid",
]);

function toUrl(input: string): URL {
  const trimmed = input.trim();

  try {
    return new URL(trimmed);
  } catch {
    return new URL(`https://${trimmed}`);
  }
}

export function normalizeDomain(input: string | undefined): string | undefined {
  if (!input?.trim()) return undefined;

  try {
    return toUrl(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function normalizeUrl(input: string): string {
  const url = toUrl(input);

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_NAMES.has(key) || key.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  const normalizedPath = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  url.pathname = normalizedPath;

  return url.toString();
}

export function isSameOrSubdomain(candidateDomain: string, officialDomain: string | undefined): boolean {
  const normalizedCandidate = normalizeDomain(candidateDomain);
  const normalizedOfficial = normalizeDomain(officialDomain);

  if (!normalizedCandidate || !normalizedOfficial) return false;

  return (
    normalizedCandidate === normalizedOfficial ||
    normalizedCandidate.endsWith(`.${normalizedOfficial}`)
  );
}

export function getNormalizedUrlParts(input: string) {
  const normalizedUrl = normalizeUrl(input);
  const url = new URL(normalizedUrl);

  return {
    normalizedUrl,
    url,
    normalizedDomain: normalizeDomain(url.hostname) ?? url.hostname.toLowerCase(),
    path: url.pathname,
  };
}
