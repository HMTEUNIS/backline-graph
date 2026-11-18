import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Decimal } from "decimal.js";

import { closePool, query } from "../src/db.js";
import { buildContractField } from "../src/field.js";
import { loadWorld } from "../src/load.js";
import { resolveArtistTerms, selectBase, type ResolvedTerms, type TermsDoc } from "../src/terms.js";

const python = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../backline/.venv/bin/python",
);

const PYTHON = `
import json, sys
from datetime import date
from backline.royaltycalc.terms import parse_terms_doc, resolve_terms

def dump(terms):
    def dec(value):
        return format(value, "f")
    return {
        "contract_id": terms.contract_id,
        "artist_id": terms.artist_id,
        "account": terms.account,
        "rate_card": [
            {"revenue_type": e.revenue_type, "territory": e.territory, "rate": dec(e.rate)}
            for e in terms.rate_card
        ],
        "escalators": [
            {"threshold_usd": dec(e.threshold_usd), "bump": dec(e.bump)}
            for e in terms.escalators
        ],
        "recoupable_classes": sorted(terms.recoupable_classes),
        "minimum_guarantee_per_period": None if terms.minimum_guarantee_per_period is None else dec(terms.minimum_guarantee_per_period),
        "excluded_territories": sorted(terms.excluded_territories),
    }

out = []
for case in json.load(sys.stdin):
    base = parse_terms_doc(case["base"])
    amendments = [parse_terms_doc(item) for item in case["amendments"]]
    out.append(dump(resolve_terms(base, amendments, date.fromisoformat(case["asOf"]))))
json.dump(out, sys.stdout)
`;

type PythonTerms = {
  contract_id: number;
  artist_id: number;
  account: string;
  rate_card: { revenue_type: string; territory: string; rate: string }[];
  escalators: { threshold_usd: string; bump: string }[];
  recoupable_classes: string[];
  minimum_guarantee_per_period: string | null;
  excluded_territories: string[];
};

function sameDecimal(actual: string, expected: string): boolean {
  return new Decimal(actual).equals(expected);
}

function assertMatches(actual: ResolvedTerms, expected: PythonTerms): void {
  assert.equal(actual.contractId, expected.contract_id);
  assert.equal(actual.artistId, expected.artist_id);
  assert.equal(actual.account, expected.account);
  assert.deepEqual([...actual.recoupableClasses].sort(), expected.recoupable_classes);
  assert.deepEqual([...actual.excludedTerritories].sort(), expected.excluded_territories);
  if (expected.minimum_guarantee_per_period === null) {
    assert.equal(actual.minimumGuaranteePerPeriod, null);
  } else {
    assert.ok(actual.minimumGuaranteePerPeriod !== null);
    assert.ok(sameDecimal(actual.minimumGuaranteePerPeriod, expected.minimum_guarantee_per_period));
  }
  assert.equal(actual.rateCard.length, expected.rate_card.length);
  actual.rateCard.forEach((entry, index) => {
    const other = expected.rate_card[index];
    assert.ok(other);
    assert.equal(entry.revenueType, other.revenue_type);
    assert.equal(entry.territory, other.territory);
    assert.ok(sameDecimal(entry.rate, other.rate));
  });
  assert.equal(actual.escalators.length, expected.escalators.length);
  actual.escalators.forEach((entry, index) => {
    const other = expected.escalators[index];
    assert.ok(other);
    assert.ok(sameDecimal(entry.thresholdUsd, other.threshold_usd));
    assert.ok(sameDecimal(entry.bump, other.bump));
  });
}

function runPython(cases: unknown[]): Promise<PythonTerms[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", PYTHON], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString() || `python exited ${code}`));
        return;
      }
      resolve(JSON.parse(Buffer.concat(stdout).toString()) as PythonTerms[]);
    });
    child.stdin.end(JSON.stringify(cases));
  });
}

function meta(doc: TermsDoc): { contract_id: number; effective_from: string; effective_to: string | null; kind: string } {
  const raw = doc.raw as { meta: { contract_id: number; effective_from: string; effective_to: string | null; kind: string } };
  return raw.meta;
}

after(async () => {
  await closePool();
});

describe("live database", () => {
  it("matches Backline's resolve_terms for every contract date", async (t) => {
    if (!existsSync(python)) {
      t.skip("backline virtualenv is not present");
      return;
    }
    let world;
    try {
      await query("SELECT 1 AS ok");
      world = await loadWorld();
    } catch (err) {
      t.skip(`postgres is not reachable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    assert.ok(world.artists.length >= 150, `expected the seeded artists, saw ${world.artists.length}`);
    const field = buildContractField(world.artists, world.docs);
    const nodeCount = field.reduce((sum, artist) => sum + artist.nodes.length, 0);
    const edgeCount = field.reduce((sum, artist) => sum + artist.edges.length, 0);
    assert.equal(nodeCount, world.docs.length);
    assert.equal(edgeCount, world.docs.filter((doc) => doc.kind === "amendment" && doc.supersedesContractId !== null).length);

    const cases: { artistId: number; asOf: string; base: unknown; amendments: unknown[] }[] = [];
    const seen = new Set<string>();
    const consider = (artistId: number, asOf: string) => {
      const key = `${artistId}:${asOf}`;
      if (seen.has(key)) return;
      seen.add(key);
      const mine = world.docs.filter((doc) => doc.artistId === artistId);
      let base: TermsDoc;
      try {
        base = selectBase(mine, asOf);
      } catch {
        return;
      }
      for (const doc of [base, ...mine]) {
        const header = meta(doc);
        assert.equal(header.contract_id, doc.contractId, `contract ${doc.contractId} meta id`);
        assert.equal(header.effective_from, doc.effectiveFrom, `contract ${doc.contractId} effective_from`);
        assert.equal(header.kind, doc.kind);
      }
      const amendments = mine.filter((doc) => doc.kind === "amendment" && doc.supersedesContractId === base.contractId);
      cases.push({ artistId, asOf, base: base.raw, amendments: amendments.map((doc) => doc.raw) });
    };
    consider(7, "2026-01-01");
    for (const doc of world.docs) consider(doc.artistId, doc.effectiveFrom);

    const ours = cases.map((item) => resolveArtistTerms(world.docs, item.artistId, item.asOf));
    const theirs = await runPython(cases);
    assert.equal(theirs.length, ours.length);
    ours.forEach((actual, index) => {
      const expected = theirs[index];
      assert.ok(expected);
      try {
        assertMatches(actual, expected);
      } catch (err) {
        const item = cases[index];
        throw new Error(
          `artist ${item?.artistId} as of ${item?.asOf}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  });
});
