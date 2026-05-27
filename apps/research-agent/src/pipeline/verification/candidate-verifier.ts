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
    const expectedSize = brief.input.expectedAttributes.size;
    const expectedFlavor = brief.input.expectedAttributes.flavor;

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

    // 1. UPC/GTIN validation
    let upcMatched = false;
    if (expectedUpc) {
      const extractedUpcs = [
        facts.attributes.gtin,
        facts.attributes.sku,
        facts.attributes.mpn,
        facts.attributes.gtin8,
        facts.attributes.gtin12,
        facts.attributes.gtin13,
        facts.attributes.gtin14,
        ...(Array.isArray(facts.attributes.heuristicUpcs) ? facts.attributes.heuristicUpcs : []),
      ].map(val => val ? String(val).trim() : "").filter(Boolean);

      if (extractedUpcs.includes(expectedUpc)) {
        upcMatched = true;
      } else {
        warnings.push({
          stage: "verification",
          message: `UPC mismatch: expected ${expectedUpc} but did not find it in extracted facts`,
          url: candidate.url,
        });
      }
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
        const brandTokens = tokenizeText(expectedBrand);
        const extBrandTokens = tokenizeText(extractedBrand);
        const brandOverlap = overlapScore(brandTokens, extBrandTokens);
        if (brandOverlap.score === 0) {
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
      const nameTokens = tokenizeText(brief.input.registerName);
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

    // 3. Compute Variant Confidence
    let variantConfidence = 1.0;
    if (upcMatched) {
      variantConfidence = 1.0;
    } else {
      // Validate Size
      if (expectedSize) {
        const normExpectedSize = this.normalizeSizeString(expectedSize);
        const extractedSizes = [
          facts.attributes.size ? String(facts.attributes.size) : "",
          ...(Array.isArray(facts.attributes.heuristicSizes) ? facts.attributes.heuristicSizes : []),
          facts.title || "",
        ].map(s => this.normalizeSizeString(s)).filter(Boolean);

        const hasSizeMatch = extractedSizes.some(s => s.includes(normExpectedSize) || normExpectedSize.includes(s));
        if (!hasSizeMatch) {
          variantConfidence -= 0.35;
          warnings.push({
            stage: "verification",
            message: `Size mismatch: expected ${expectedSize} but did not find it in extracted facts`,
            url: candidate.url,
          });
        }
      }

      // Validate Flavor
      if (expectedFlavor) {
        const normExpectedFlavor = expectedFlavor.toLowerCase().trim();
        const extractedFlavors = [
          facts.attributes.flavor ? String(facts.attributes.flavor) : "",
          facts.title || "",
          facts.description || "",
        ].map(f => f.toLowerCase().trim()).filter(Boolean);

        const hasFlavorMatch = extractedFlavors.some(f => f.includes(normExpectedFlavor));
        if (!hasFlavorMatch) {
          variantConfidence -= 0.35;
          warnings.push({
            stage: "verification",
            message: `Flavor mismatch: expected ${expectedFlavor} but did not find it in extracted facts`,
            url: candidate.url,
          });
        }
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

  private normalizeSizeString(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
}
