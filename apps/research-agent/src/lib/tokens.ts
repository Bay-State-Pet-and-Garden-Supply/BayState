const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function expandToken(token: string): string[] {
  const expanded = new Set<string>([token]);

  const sizeMatch = token.match(/^(\d+)(oz|lb|lbs|g|kg|ml|gal)$/);
  if (sizeMatch) {
    expanded.add(sizeMatch[1]);
    expanded.add(sizeMatch[2]);
  }

  if (/^\d{8,}$/.test(token)) {
    expanded.add(token);
  }

  return [...expanded];
}

export function tokenizeText(...values: Array<string | undefined>): string[] {
  const tokens = values
    .flatMap((value) =>
      (value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    )
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return [...new Set(tokens.flatMap((token) => expandToken(token)))];
}

export function overlapScore(expected: Iterable<string>, actual: Iterable<string>): {
  matchedTokens: string[];
  score: number;
} {
  const expectedTokens = [...new Set(expected)];
  const actualTokenSet = new Set(actual);
  const matchedTokens = expectedTokens.filter((token) => actualTokenSet.has(token));

  if (expectedTokens.length === 0) {
    return { matchedTokens: [], score: 0 };
  }

  return {
    matchedTokens,
    score: matchedTokens.length / expectedTokens.length,
  };
}
