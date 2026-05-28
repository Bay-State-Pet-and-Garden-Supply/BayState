const IMAGE_QUERY_PARAMS_TO_STRIP = new Set([
  "width",
  "height",
  "crop",
  "fit",
  "auto",
  "q",
  "quality",
  "ixlib",
  "ixid",
  "w",
  "h",
  "fm",
  "format",
  "dpr",
  "s",
  "sw",
  "sh",
  "trim",
  "background",
  "bg",
  "canvas",
  "pad",
  "fitmode",
  "cropmode",
  "cropx",
  "cropy",
]);

const IMAGE_SIZE_PATH_RE = /-\d+x\d+(?=\.[a-z]{3,4}$)/i;

export function toAbsoluteImageUrl(url: string | undefined, baseUrl: string) {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      if (trimmed.startsWith("//")) {
        try {
          return new URL(`https:${trimmed}`).toString();
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
}

export function canonicalizeImageUrl(url: string): string {
  const parsed = new URL(url);

  for (const key of [...parsed.searchParams.keys()]) {
    if (IMAGE_QUERY_PARAMS_TO_STRIP.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(IMAGE_SIZE_PATH_RE, "");

  return parsed.toString();
}
