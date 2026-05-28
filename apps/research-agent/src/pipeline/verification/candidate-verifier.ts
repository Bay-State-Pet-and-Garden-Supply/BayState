import type { EvaluatedCandidate } from "../../schemas/CandidateUrl";
import type { CandidateVerifier } from "../ports";
import type {
  PageFactSet,
  ProductResearchBrief,
  ProductResearchPipelineContext,
  VerificationResult,
  PipelineWarning,
} from "../types";
import { tokenizeText, overlapScore } from "../../lib/tokens";
import { normalizeBarcode } from "../../lib/barcode";
import { isSameOrSubdomain } from "../../lib/url";

function collectAttributeText(attributes: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const value of Object.values(attributes)) {
    if (typeof value === "string" || typeof value === "number") {
      values.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" || typeof item === "number") {
          values.push(String(item));
        }
      }
    }
  }
  return values;
}

function buildRegisterDescriptorTokens(brand: string, registerName: string, upc: string): string[] {
  const anchorTokens = new Set([...tokenizeText(brand), ...tokenizeText(upc)]);
  return tokenizeText(registerName).filter((token) => !anchorTokens.has(token));
}

function buildTitleComparisonTokens(brief: ProductResearchBrief, candidate: EvaluatedCandidate): string[] {
  const descriptorTokens = buildRegisterDescriptorTokens(
    brief.input.brand,
    brief.input.registerName,
    brief.input.upc,
  );

  if (
    descriptorTokens.length > 0
    && brief.resolvedInput.officialDomainResolved
    && isSameOrSubdomain(candidate.normalizedDomain, brief.resolvedInput.officialDomainResolved)
  ) {
    return descriptorTokens;
  }

  return tokenizeText(brief.input.registerName);
}

function normalizeBrandComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(petfoods|petfood|pets|pet|foods|food|fuels|fuel|racing|reproductive|animalhealth|health)$/i, "");
}

function brandLooksCompatible(expectedBrand: string, extractedBrand: string, candidate: EvaluatedCandidate, officialDomain: string | undefined) {
  const brandOverlap = overlapScore(tokenizeText(expectedBrand), tokenizeText(extractedBrand));
  if (brandOverlap.score > 0) return true;

  const normalizedExpected = normalizeBrandComparable(expectedBrand);
  const normalizedExtracted = normalizeBrandComparable(extractedBrand);
  if (!normalizedExpected || !normalizedExtracted) return false;

  if (normalizedExpected === normalizedExtracted) return true;

  const relaxedMatch = normalizedExpected.includes(normalizedExtracted) || normalizedExtracted.includes(normalizedExpected);
  if (!relaxedMatch) return false;

  return Boolean(officialDomain && isSameOrSubdomain(candidate.normalizedDomain, officialDomain));
}

export class DefaultCandidateVerifier implements CandidateVerifier {
  async verifyCandidate(
    candidate: EvaluatedCandidate,
    facts: PageFactSet | undefined,
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<VerificationResult> {
    const warnings: PipelineWarning[] = [];
    const expectedBrand = brief.input.brand;
    const expectedUpc = brief.input.upc;
    const officialDomain = brief.resolvedInput.officialDomainResolved;

    if (!facts || facts.confidence === 0) {
      warnings.push({
        stage: "verification",
        message: "No facts extracted from the page",
        url: candidate.url,
      });

      return {
        candidate,
        facts,
        identityConfidence: 0.0,
        variantConfidence: 0.0,
        storefrontReadinessContribution: 0.0,
        warnings,
      };
    }

    // 1. UPC/GTIN validation. UPC is the primary upload anchor, but many official
    // brand pages omit it; absence is a warning, while an exact match is decisive.
    let upcMatched = false;
    const normalizedExpectedUpc = normalizeBarcode(expectedUpc);
    const extractedUpcs = [
      facts.attributes.gtin,
      facts.attributes.sku,
      facts.attributes.mpn,
      facts.attributes.gtin8,
      facts.attributes.gtin12,
      facts.attributes.gtin13,
      facts.attributes.gtin14,
      ...(Array.isArray(facts.attributes.heuristicUpcs) ? facts.attributes.heuristicUpcs : []),
    ]
      .map(val => val ? normalizeBarcode(String(val)) : "")
      .filter(Boolean);

    if (extractedUpcs.includes(normalizedExpectedUpc)) {
      upcMatched = true;
    } else {
      warnings.push({
        stage: "verification",
        message: `UPC not found in extracted facts for uploaded anchor ${expectedUpc}`,
        url: candidate.url,
      });
    }

    // 2. Compute Identity Confidence
    let identityConfidence = candidate.score; // Start with the candidate's initial rank score

    if (upcMatched) {
      // Direct UPC match is extremely strong evidence
      identityConfidence = 0.98;
    } else {
      // Validate Brand
      const extractedBrand = facts.attributes.brand ? String(facts.attributes.brand).trim() : undefined;
      if (extractedBrand) {
        if (!brandLooksCompatible(expectedBrand, extractedBrand, candidate, officialDomain)) {
          // Brand mismatch penalizes significantly
          identityConfidence *= 0.4;
          warnings.push({
            stage: "verification",
            message: `Brand mismatch: expected ${expectedBrand} but found ${extractedBrand}`,
            url: candidate.url,
          });
        } else {
          // Confirming brand boosts confidence
          identityConfidence = Math.min(1.0, identityConfidence + 0.1);
        }
      }

      // Title/Name token overlap
      const nameTokens = buildTitleComparisonTokens(brief, candidate);
      const extractedTitleTokens = tokenizeText(facts.title);
      const titleOverlap = overlapScore(nameTokens, extractedTitleTokens);
      if (titleOverlap.score >= 0.5) {
        identityConfidence = Math.min(1.0, identityConfidence + 0.1);
      } else if (titleOverlap.score < 0.2) {
        identityConfidence *= 0.7;
        warnings.push({
          stage: "verification",
          message: `Low title overlap: page title "${facts.title || ""}" has low similarity with expected "${brief.input.registerName}"`,
          url: candidate.url,
        });
      }
    }

    // 3. Compute Variant Confidence from the uploaded register name and extracted facts,
    // not from pre-supplied structured attributes.
    let variantConfidence = 1.0;
    if (upcMatched) {
      variantConfidence = 1.0;
    } else {
      const expectedDescriptorTokens = buildRegisterDescriptorTokens(
        expectedBrand,
        brief.input.registerName,
        expectedUpc,
      );
      const actualDescriptorTokens = tokenizeText(
        facts.title,
        facts.description,
        ...facts.categories,
        ...collectAttributeText(facts.attributes),
      );
      const descriptorOverlap = overlapScore(expectedDescriptorTokens, actualDescriptorTokens);
      variantConfidence = expectedDescriptorTokens.length > 0
        ? descriptorOverlap.score
        : candidate.variantScore;

      if (expectedDescriptorTokens.length > 0 && descriptorOverlap.score < 0.35) {
        warnings.push({
          stage: "verification",
          message: `Low register-name descriptor overlap: matched ${descriptorOverlap.matchedTokens.length}/${expectedDescriptorTokens.length} descriptive tokens`,
          url: candidate.url,
        });
      }
    }

    // Clamp values
    identityConfidence = Math.max(0.0, Math.min(1.0, identityConfidence));
    variantConfidence = Math.max(0.0, Math.min(1.0, variantConfidence));

    // 4. Compute Storefront Readiness Contribution
    let storefrontReadinessContribution = 0.0;
    if (facts.title) storefrontReadinessContribution += 0.2;
    if (facts.description && facts.description.length > 20) storefrontReadinessContribution += 0.4;
    if (facts.images && facts.images.length > 0) storefrontReadinessContribution += 0.4;

    storefrontReadinessContribution *= (identityConfidence * variantConfidence);
    storefrontReadinessContribution = Math.max(0.0, Math.min(1.0, storefrontReadinessContribution));

    // Add general page completeness warnings
    if (!facts.description || facts.description.length <= 20) {
      warnings.push({
        stage: "verification",
        message: "No product description found on page",
        url: candidate.url,
      });
    }
    if (!facts.images || facts.images.length === 0) {
      warnings.push({
        stage: "verification",
        message: "No product images found on page",
        url: candidate.url,
      });
    }

    return {
      candidate,
      facts,
      identityConfidence,
      variantConfidence,
      storefrontReadinessContribution,
      warnings,
    };
  }
}
