import type { TermsDoc } from "../src/terms.js";
import { parseTermsDoc } from "../src/terms.js";

export function baseDocJson(): Record<string, unknown> {
  return {
    meta: {
      contract_id: 101,
      artist_id: 7,
      kind: "base",
      effective_from: "2023-04-01",
      effective_to: null,
      replaced_sections: [],
    },
    sections: {
      term_territory: { excluded_territories: [] },
      royalties: {
        rate_card: [
          { revenue_type: "streaming", territory: "WW", rate: "0.30" },
          { revenue_type: "physical", territory: "GB", rate: "0.15" },
          { revenue_type: "physical", territory: "WW", rate: "0.10" },
        ],
        escalators: [{ threshold_usd: "250000", bump: "0.02" }],
      },
      advances_recoupment: {
        account: "ACC-7-1",
        recoupable_classes: ["recording", "video"],
        minimum_guarantee_per_period: null,
      },
    },
  };
}

export function amendmentJson(
  contractId = 501,
  effectiveFrom = "2026-01-15",
  rate = "0.34",
): Record<string, unknown> {
  return {
    meta: {
      contract_id: contractId,
      artist_id: 7,
      kind: "amendment",
      effective_from: effectiveFrom,
      effective_to: null,
      replaced_sections: ["royalties"],
    },
    sections: {
      royalties: {
        rate_card: [{ revenue_type: "streaming", territory: "WW", rate }],
        escalators: [],
      },
    },
  };
}

export function doc(json: Record<string, unknown>, supersedes: number | null = null): TermsDoc {
  return { ...parseTermsDoc(structuredClone(json)), supersedesContractId: supersedes };
}
