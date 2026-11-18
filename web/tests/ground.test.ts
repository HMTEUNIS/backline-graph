import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { citeAgentText, tryGraphAnswer } from "../src/lib/ground.ts";
import type { ArtistField } from "../src/lib/types.ts";

const field: ArtistField[] = [
  {
    artist: { id: 7, stageName: "Nova Hale", legalName: "Nova Hale", joinedAt: "2020-01-01", country: "US" },
    nodes: [
      {
        contractId: 511,
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        kind: "BASE",
        resolvedRate: 0.2,
        docPath: "data/contracts/FBR-C-00511_nova-hale.pdf",
        sourcePath: "nova-hale/base/FBR-C-00511_nova-hale.pdf",
        rawTerms: "{}",
        rates: [{ revenueType: "streaming", territory: "WW", rate: "0.20" }],
      },
      {
        contractId: 2004,
        effectiveFrom: "2025-06-01",
        effectiveTo: null,
        kind: "AMENDMENT",
        resolvedRate: 0.15,
        docPath: "data/contracts/FBR-A-02004_nova-hale.pdf",
        sourcePath: "nova-hale/amendments/FBR-A-02004_nova-hale.pdf",
        rawTerms: "{}",
        rates: [{ revenueType: "streaming", territory: "WW", rate: "0.15" }],
      },
    ],
    edges: [
      {
        fromContractId: 511,
        toContractId: 2004,
        effectiveFrom: "2025-06-01",
        replacedSections: ["royalties"],
        rateDelta: -0.05,
      },
    ],
  },
  {
    artist: { id: 8, stageName: "Cedar Moth", legalName: "Cedar Moth", joinedAt: "2021-01-01", country: "GB" },
    nodes: [
      {
        contractId: 520,
        effectiveFrom: "2023-01-01",
        effectiveTo: null,
        kind: "BASE",
        resolvedRate: 0.18,
        docPath: "data/contracts/FBR-C-00520_cedar.pdf",
        sourcePath: null,
        rawTerms: "{}",
        rates: [{ revenueType: "streaming", territory: "WW", rate: "0.18" }],
      },
    ],
    edges: [],
  },
];

describe("graph answers", () => {
  it("cites the contracts on a rate cut", () => {
    const answer = tryGraphAnswer("Which artists had their rate cut?", field, "streaming");
    assert.ok(answer);
    assert.match(answer.text, /Nova Hale/);
    assert.doesNotMatch(answer.text, /Cedar Moth/);
    assert.deepEqual(
      answer.citations.map((citation) => citation.contractId),
      [511, 2004],
    );
    assert.equal(answer.citations[1]?.field, "rateDelta");
  });

  it("says so when nothing was cut", () => {
    const flat = field.filter((artist) => artist.artist.id === 8);
    const answer = tryGraphAnswer("Which artists had their rate cut?", flat, "streaming");
    assert.ok(answer);
    assert.match(answer.text, /No artist/);
    assert.deepEqual(answer.citations, []);
    assert.equal(answer.source, "graph");
  });

  it("summarizes one artist from the field", () => {
    const answer = tryGraphAnswer("What is artist 7's streaming rate?", field, "streaming");
    assert.ok(answer);
    assert.match(answer.text, /0\.20/);
    assert.match(answer.text, /0\.15/);
    assert.equal(answer.metric, "streaming");
  });

  it("leaves clause questions to the agent", () => {
    assert.equal(tryGraphAnswer("What does the audit clause say?", field, "streaming"), null);
  });
});

describe("agent citations", () => {
  it("grounds an FBR code and ignores a year", () => {
    const citations = citeAgentText("See FBR-C-00511 §3 in 2025.", [], field);
    assert.deepEqual(citations, [{ type: "node", contractId: 511, field: "resolvedRate" }]);
  });

  it("marks an amendment node as a rate change", () => {
    const citations = citeAgentText("contract 2004 replaced the card", [], field);
    assert.equal(citations[0]?.field, "rateDelta");
  });

  it("returns nothing when the reply names no contract", () => {
    assert.deepEqual(citeAgentText("Rates moved around.", [], field), []);
  });
});
