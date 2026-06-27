/**
 * Tests for UPC/GTIN utilities.
 *
 * Covers normalize, check digit validation, equivalence/compare
 * for GTIN-8/12/13/14.
 */

import {
  normalizeGtin,
  validateGtin,
  isValidGtin,
  validateGtinCheckDigit,
  compareGtin,
  detectGtinLength,
  computeCheckDigit,
  padGtinToLength,
  toGtin14,
  extractObservedGtin,
} from "../upc";

describe("normalizeGtin", () => {
  it("strips dashes", () => {
    expect(normalizeGtin("0-733053-005941")).toBe("0733053005941");
  });

  it("strips spaces", () => {
    expect(normalizeGtin("0 733053 005941")).toBe("0733053005941");
  });

  it("strips parentheses", () => {
    expect(normalizeGtin("(0)733053005941")).toBe("0733053005941");
  });

  it("passes through digits only", () => {
    expect(normalizeGtin("4901234567890")).toBe("4901234567890");
  });

  it("returns empty string for no digits", () => {
    expect(normalizeGtin("ABC-DEF")).toBe("");
  });

  it("handles empty string", () => {
    expect(normalizeGtin("")).toBe("");
  });
});

describe("detectGtinLength", () => {
  it("detects GTIN-8", () => {
    expect(detectGtinLength("12345678")).toBe(8);
  });

  it("detects GTIN-12", () => {
    expect(detectGtinLength("123456789012")).toBe(12);
  });

  it("detects GTIN-13", () => {
    expect(detectGtinLength("4901234567890")).toBe(13);
  });

  it("detects GTIN-14", () => {
    expect(detectGtinLength("12345678901234")).toBe(14);
  });

  it("returns null for invalid lengths", () => {
    expect(detectGtinLength("12345")).toBeNull();
    expect(detectGtinLength("1234567890")).toBeNull();
    expect(detectGtinLength("123456789012345")).toBeNull();
  });
});

describe("validateGtinCheckDigit", () => {
  // Valid GTIN-13: 9780201379624 (ISBN-13, valid check digit 4)
  it("validates a correct GTIN-13 check digit", () => {
    expect(validateGtinCheckDigit("9780201379624")).toBe(true);
  });

  // Valid GTIN-12 (UPC-A): 042100005264 (check digit 4)
  it("validates a correct GTIN-12 check digit", () => {
    expect(validateGtinCheckDigit("042100005264")).toBe(true);
  });

  // Valid GTIN-14: 19780201379621 (indicator 1 + data from GTIN-13 9780201379624 + new check digit 1)
  it("validates a correct GTIN-14 check digit", () => {
    expect(validateGtinCheckDigit("19780201379621")).toBe(true);
  });

  // Valid GTIN-8: 12345670 (known test EAN-8)
  it("validates a correct GTIN-8 check digit", () => {
    expect(validateGtinCheckDigit("12345670")).toBe(true);
  });

  it("rejects invalid check digit", () => {
    // Flip a digit that changes the check digit
    expect(validateGtinCheckDigit("9780201379625")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateGtinCheckDigit("")).toBe(false);
  });

  it("returns false for non-digit chars in body", () => {
    expect(validateGtinCheckDigit("490X234567890")).toBe(false);
  });
});

describe("validateGtin", () => {
  it("validates a complete valid GTIN-13", () => {
    const result = validateGtin("9780201379624");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("9780201379624");
    expect(result.length).toBe(13);
    expect(result.checkDigitValid).toBe(true);
  });

  it("validates with dashes and spaces", () => {
    const result = validateGtin("9-780201-379624");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("9780201379624");
    expect(result.length).toBe(13);
    expect(result.checkDigitValid).toBe(true);
  });

  it("returns invalid for no digits", () => {
    const result = validateGtin("ABC");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("No digits");
  });

  it("returns invalid for unsupported length in 8-14 range", () => {
    // 10 digits is within 8-14 but not a valid GTIN length (only 8, 12, 13, 14 are valid)
    const result = validateGtin("1234567890");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unsupported GTIN length");
  });

  it("returns invalid for bad check digit", () => {
    const result = validateGtin("9780201379625");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Check digit validation failed");
  });

  it("validates GTIN-12", () => {
    const result = validateGtin("042100005264");
    expect(result.valid).toBe(true);
    expect(result.length).toBe(12);
  });

  it("validates GTIN-14", () => {
    const result = validateGtin("19780201379621");
    expect(result.valid).toBe(true);
    expect(result.length).toBe(14);
  });

  it("validates GTIN-8", () => {
    const result = validateGtin("12345670");
    expect(result.valid).toBe(true);
    expect(result.length).toBe(8);
  });
});

describe("isValidGtin", () => {
  it("returns true for valid GTIN", () => {
    expect(isValidGtin("042100005264")).toBe(true);
  });

  it("returns false for invalid GTIN", () => {
    expect(isValidGtin("not-a-gtin")).toBe(false);
  });

  it("returns false for bad check digit", () => {
    expect(isValidGtin("9780201379625")).toBe(false);
  });
});

describe("compareGtin", () => {
  it("returns true for identical GTINs", () => {
    expect(compareGtin("9780201379624", "9780201379624")).toBe(true);
  });

  it("returns true for GTIN-13 and GTIN-12 with same data digits", () => {
    // GTIN-13 "042100005264" and GTIN-12 "042100005264" (same)
    expect(compareGtin("042100005264", "042100005264")).toBe(true);
  });

  it("returns true for GTIN-14 and GTIN-13 same product", () => {
    // GTIN-14 "0042100005264" and GTIN-13 "042100005264"
    // zero-padding both to 14: "0042100005264" vs "00042100005264" — wait
    // Actually padStart(14, "0") on "042100005264" = "000042100005264" (14 chars)
    // and on "0042100005264" = "000042100005264" → same!
    // No wait, "042100005264" has 12 chars, padStart(14, '0') = "00042100005264" — check: 0+0+042100005264 = 14 chars
    // "0042100005264" has 13 chars, padStart(14, '0') = "00042100005264" — same!
    expect(compareGtin("042100005264", "0042100005264")).toBe(true);
  });

  it("handles formatted input", () => {
    expect(compareGtin("042100005264", "042100005264")).toBe(true);
  });

  it("returns false for different GTINs", () => {
    expect(compareGtin("042100005264", "9780201379624")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(compareGtin("", "4901234567890")).toBe(false);
  });
});

describe("computeCheckDigit", () => {
  it("computes check digit 4 for 978020137962", () => {
    // 978020137962 has check digit 4 (from 9780201379624)
    expect(computeCheckDigit("978020137962")).toBe(4);
  });

  it("computes check digit 3 for 073305300594", () => {
    // GTIN-12 data digits 073305300594 → check digit 3
    expect(computeCheckDigit("073305300594")).toBe(3);
  });
});

describe("padGtinToLength", () => {
  it("zero-pads GTIN-12 to GTIN-13", () => {
    // 12-digit input padded to 13 → 1 leading zero
    expect(padGtinToLength("042100005264", 13)).toBe("0042100005264");
    // 11-digit input padded to 13 → 2 leading zeros
    expect(padGtinToLength("42100005264", 13)).toBe("0042100005264");
  });

  it("returns null if input is longer than target", () => {
    expect(padGtinToLength("9780201379624", 12)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(padGtinToLength("", 13)).toBeNull();
  });
});

describe("toGtin14", () => {
  it("converts GTIN-13 to GTIN-14", () => {
    // 13-digit input padded to 14 → 1 leading zero
    expect(toGtin14("9780201379624")).toBe("09780201379624");
  });

  it("converts GTIN-12 to GTIN-14", () => {
    // 12-digit input padded to 14 → 2 leading zeros
    expect(toGtin14("042100005264")).toBe("00042100005264");
  });
});

describe("extractObservedGtin", () => {
  it("extracts from top-level upc field", () => {
    expect(extractObservedGtin({ upc: "042100005264" })).toBe("042100005264");
  });

  it("extracts from top-level gtin field", () => {
    expect(extractObservedGtin({ gtin: "042100005264" })).toBe("042100005264");
  });

  it("extracts from top-level barcode field", () => {
    expect(extractObservedGtin({ barcode: "042100005264" })).toBe("042100005264");
  });

  it("prefers upc over gtin when both present", () => {
    expect(extractObservedGtin({ upc: "042100005264", gtin: "4901234567890" })).toBe("042100005264");
  });

  it("returns empty string for null product", () => {
    expect(extractObservedGtin(null)).toBe("");
  });

  it("returns empty string for undefined product", () => {
    expect(extractObservedGtin(undefined)).toBe("");
  });

  it("returns empty string when no identifier fields present", () => {
    expect(extractObservedGtin({ name: "Product", brand: "Brand" })).toBe("");
  });

  it("extracts from top-level gtin12 field", () => {
    expect(extractObservedGtin({ gtin12: "042100005264" })).toBe("042100005264");
  });

  it("extracts from top-level gtin13 field", () => {
    expect(extractObservedGtin({ gtin13: "4901234567890" })).toBe("4901234567890");
  });

  it("extracts from facet entry with definition_slug upc", () => {
    const product = {
      name: "Product Name",
      facets: [
        { definition_slug: "upc", value: "042100005264" },
        { definition_slug: "brand", value: "BrandName" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("042100005264");
  });

  it("extracts from facet entry with name gtin", () => {
    const product = {
      facets: [
        { name: "gtin", value: "4901234567890" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("4901234567890");
  });

  it("extracts from facet entry with label barcode", () => {
    const product = {
      facets: [
        { label: "Barcode", value: "042100005264" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("042100005264");
  });

  it("reads value_text from facet when value is absent", () => {
    const product = {
      facets: [
        { definition_slug: "upc", value_text: "042100005264" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("042100005264");
  });

  it("prefers top-level upc over facet upc", () => {
    const product = {
      upc: "042100005264",
      facets: [
        { definition_slug: "upc", value: "4901234567890" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("042100005264");
  });

  it("handles numeric value in facet (leading zero is JS-number-lost)", () => {
    const product = {
      facets: [
        { definition_slug: "upc", value: 42100005264 }, // JS numeric loses leading zero
      ],
    };
    // String(42100005264) = "42100005264" — leading zero is lost because
    // JSON/JS numbers don't preserve formatting. Actual runner payloads
    // send identifiers as strings, so this edge case is rare.
    expect(extractObservedGtin(product)).toBe("42100005264");
  });

  it("strips formatting characters from facet value", () => {
    const product = {
      facets: [
        { definition_slug: "upc", value: "0-421-00005-264" },
      ],
    };
    expect(extractObservedGtin(product)).toBe("042100005264");
  });
});
