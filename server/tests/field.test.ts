import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildContractField } from "../src/field.js";
import { resolveArtistTerms } from "../src/terms.js";
import { amendmentJson, baseDocJson, doc } from "./fixtures.js";
import type { ArtistRow } from "../src/load.js";

const artist: ArtistRow = {
  id: 7,
  stageName: "Fixture",
  legalName: "Fixture Legal",
  joinedAt: "2020-01-01",
  country: "US",
};

describe("contract field", () => {
  it("places the base and the amendment, and the edge is the rate change", () => {
    const base = doc(baseDocJson());
    base.sourcePath = "fixture/base/FBR-C-00101_fixture.pdf";
    const amendment = doc(amendmentJson(), 101);
    amendment.sourcePath = "fixture/amendments/FBR-A-00501_fixture.pdf";
    const [field] = buildContractField([artist], [base, amendment]);
    assert.ok(field);
    assert.deepEqual(
      field.nodes.map((node) => [node.contractId, node.kind, node.resolvedRate]),
      [
        [101, "BASE", 0.3],
        [501, "AMENDMENT", 0.34],
      ],
    );
    assert.equal(field.nodes[1]?.rates.some((entry) => entry.revenueType === "physical"), false);
    assert.equal(field.edges.length, 1);
    assert.equal(field.nodes[0]?.sourcePath, "fixture/base/FBR-C-00101_fixture.pdf");
    assert.equal(field.nodes[1]?.sourcePath, "fixture/amendments/FBR-A-00501_fixture.pdf");
    assert.equal(field.edges[0]?.fromContractId, 101);
    assert.equal(field.edges[0]?.toContractId, 501);
    assert.equal(field.edges[0]?.effectiveFrom, "2026-01-15");
    assert.deepEqual(field.edges[0]?.replacedSections, ["royalties"]);
    assert.ok(Math.abs((field.edges[0]?.rateDelta ?? 0) - 0.04) < 1e-9);
  });

  it("does not let a later era inherit the previous era's amendment", () => {
    const early = doc(baseDocJson());
    const amendment = doc(amendmentJson(501, "2024-06-01", "0.40"), 101);
    const laterRaw = baseDocJson();
    (laterRaw.meta as { contract_id: number }).contract_id = 202;
    (laterRaw.meta as { effective_from: string }).effective_from = "2025-01-01";
    const later = doc(laterRaw);
    const terms = resolveArtistTerms([early, amendment, later], 7, "2026-01-01");
    assert.equal(terms.contractId, 202);
    assert.deepEqual(terms.appliedAmendmentIds, []);
    assert.equal(terms.rateCard.find((entry) => entry.revenueType === "streaming")?.rate, "0.30");
    const [field] = buildContractField([artist], [early, amendment, later]);
    const node = field?.nodes.find((item) => item.contractId === 202);
    assert.equal(node?.resolvedRate, 0.3);
    const amendmentNode = field?.nodes.find((item) => item.contractId === 501);
    assert.equal(amendmentNode?.resolvedRate, 0.4);
  });
});
