import type { CandidateDiscoveryProvider } from "../ports";
import type { DiscoveryResult, ProductResearchBrief, ProductResearchPipelineContext } from "../types";

export class StaticCandidateDiscovery implements CandidateDiscoveryProvider {
  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext
  ): Promise<DiscoveryResult> {
    return {
      candidates: brief.input.candidateUrls || [],
      warnings: [],
    };
  }
}
