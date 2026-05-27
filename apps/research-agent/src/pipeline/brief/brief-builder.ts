import type { ResearchBriefBuilder } from "../ports";
import type { ProductResearchInput } from "../../schemas/ProductResearchInput";
import { productResearchInputSchema } from "../../schemas/ProductResearchInput";
import type { ProductResearchBrief, ProductResearchPipelineContext } from "../types";
import { resolveInput } from "../../lib/candidate-scoring";

export class DefaultBriefBuilder implements ResearchBriefBuilder {
  async buildBrief(
    input: ProductResearchInput,
    context: ProductResearchPipelineContext
  ): Promise<ProductResearchBrief> {
    // Validate the input using Zod schema
    const validatedInput = productResearchInputSchema.parse(input);
    const resolvedInput = resolveInput(validatedInput);

    return {
      input: validatedInput,
      resolvedInput,
      constraints: {
        requireIdentityEvidence: true,
        preferOfficialSource: true,
        allowDistributorCanonical: false,
      },
    };
  }
}
