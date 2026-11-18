import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { graphql, printSchema } from "graphql";

import { schema } from "../src/schema.js";
import type { World } from "../src/load.js";
import { amendmentJson, baseDocJson, doc } from "./fixtures.js";

function world(): World {
  return {
    artists: [
      { id: 7, stageName: "Fixture", legalName: "Fixture Legal", joinedAt: "2020-01-01", country: "US" },
    ],
    docs: [doc(baseDocJson()), doc(amendmentJson(), 101)],
  };
}

describe("schema", () => {
  it("does not publish a truth type", () => {
    const printed = printSchema(schema);
    assert.match(printed, /type Artist /);
    assert.match(printed, /resolvedTerms\(artistId: Int!, asOf: String!\): ResolvedTerms/);
    assert.match(printed, /contractField: \[ArtistField!\]!/);
    assert.match(printed, /sourcePath: String/);
    assert.doesNotMatch(printed, /truth/i);
  });

  it("resolves a wholesale amendment through the query", async () => {
    const result = await graphql({
      schema,
      source: `query {
        resolvedTerms(artistId: 7, asOf: "2026-01-15") {
          contractId
          appliedAmendmentIds
          account
          rateCard { revenueType territory rate }
        }
      }`,
      contextValue: { world: world() },
    });
    assert.equal(result.errors, undefined);
    const terms = (result.data as { resolvedTerms: { contractId: number; appliedAmendmentIds: number[]; account: string; rateCard: { rate: string }[] } }).resolvedTerms;
    assert.equal(terms.contractId, 101);
    assert.deepEqual(terms.appliedAmendmentIds, [501]);
    assert.equal(terms.account, "ACC-7-1");
    assert.deepEqual(JSON.parse(JSON.stringify(terms.rateCard)), [
      { revenueType: "streaming", territory: "WW", rate: "0.34" },
    ]);
  });

  it("errors for a missing artist without looking anywhere else", async () => {
    const result = await graphql({
      schema,
      source: `query { resolvedTerms(artistId: 999999, asOf: "2026-01-01") { contractId } }`,
      contextValue: { world: world() },
    });
    assert.equal(result.data?.resolvedTerms ?? null, null);
    assert.match(result.errors?.[0]?.message ?? "", /No artist 999999 in label\.artists/);
    assert.doesNotMatch(result.errors?.[0]?.message ?? "", /truth/i);
  });
});
