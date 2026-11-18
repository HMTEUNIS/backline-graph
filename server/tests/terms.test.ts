import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Decimal } from "decimal.js";

import { amendmentJson, baseDocJson, doc } from "./fixtures.js";
import {
  SECTION_ADVANCES,
  SECTION_KEYS,
  SECTION_ROYALTIES,
  SECTION_TERM_TERRITORY,
  docToJson,
  parseTermsDoc,
  resolveArtistTerms,
  resolveTerms,
  selectBase,
} from "../src/terms.js";

function rateMap(card: { revenueType: string; territory: string; rate: string }[]): Map<string, string> {
  return new Map(card.map((entry) => [`${entry.revenueType}|${entry.territory}`, entry.rate]));
}

describe("parse", () => {
  it("parses meta", () => {
    const parsed = parseTermsDoc(baseDocJson());
    assert.equal(parsed.contractId, 101);
    assert.equal(parsed.artistId, 7);
    assert.equal(parsed.kind, "base");
    assert.equal(parsed.effectiveFrom, "2023-04-01");
    assert.equal(parsed.effectiveTo, null);
    assert.deepEqual(parsed.replacedSections, []);
  });

  it("roundtrips the canonical json", () => {
    const original = baseDocJson();
    assert.deepEqual(docToJson(parseTermsDoc(original)), original);
    JSON.stringify(docToJson(parseTermsDoc(original)));
  });

  it("rejects a float rate", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { rate: unknown }[] } }).royalties.rate_card[0] as { rate: unknown }).rate = 0.3;
    assert.throws(() => parseTermsDoc(bad), { name: "TypeError", message: /float/ });
  });

  it("rejects an unknown revenue type", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { revenue_type: string }[] } }).royalties.rate_card[0] as { revenue_type: string }).revenue_type = "merch";
    assert.throws(() => parseTermsDoc(bad), /merch/);
  });

  it("rejects an unknown section", () => {
    const bad = baseDocJson();
    (bad.sections as Record<string, unknown>).merchandising = {};
    assert.throws(() => parseTermsDoc(bad), /merchandising/);
  });

  it("rejects an unknown kind", () => {
    const bad = baseDocJson();
    (bad.meta as { kind: string }).kind = "sidedeal";
    assert.throws(() => parseTermsDoc(bad), /sidedeal/);
  });

  it("rejects a negative rate", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { rate: string }[] } }).royalties.rate_card[0] as { rate: string }).rate = "-0.10";
    assert.throws(() => parseTermsDoc(bad), /rate/);
  });

  it("keeps the section key order from Backline", () => {
    assert.deepEqual(SECTION_KEYS, [SECTION_TERM_TERRITORY, SECTION_ROYALTIES, SECTION_ADVANCES]);
  });
});

describe("resolve", () => {
  it("returns the base when nothing else is effective", () => {
    const terms = resolveTerms(doc(baseDocJson()), [], "2026-03-31");
    assert.equal(terms.contractId, 101);
    assert.equal(terms.account, "ACC-7-1");
    assert.deepEqual(terms.recoupableClasses, ["recording", "video"]);
    assert.equal(terms.minimumGuaranteePerPeriod, null);
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.30");
    assert.ok(new Decimal(terms.escalators[0]?.thresholdUsd ?? "").equals("250000"));
    assert.deepEqual(terms.appliedAmendmentIds, []);
  });

  it("ignores an amendment that is not yet effective", () => {
    const terms = resolveTerms(doc(baseDocJson()), [doc(amendmentJson())], "2026-01-14");
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.30");
    assert.deepEqual(terms.appliedAmendmentIds, []);
  });

  it("replaces a section wholesale", () => {
    const terms = resolveTerms(doc(baseDocJson()), [doc(amendmentJson())], "2026-01-15");
    const rates = rateMap(terms.rateCard);
    assert.equal(rates.get("streaming|WW"), "0.34");
    assert.equal(rates.has("physical|GB"), false);
    assert.deepEqual(terms.escalators, []);
    assert.equal(terms.account, "ACC-7-1");
    assert.deepEqual(terms.appliedAmendmentIds, [501]);
  });

  it("lets the later effective date win, whatever order the list arrives in", () => {
    const first = doc(amendmentJson(501, "2025-10-01", "0.32"));
    const second = doc(amendmentJson(502, "2026-02-01", "0.36"));
    const terms = resolveTerms(doc(baseDocJson()), [second, first], "2026-06-30");
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.36");
    assert.deepEqual(terms.appliedAmendmentIds, [501, 502]);
    const mid = resolveTerms(doc(baseDocJson()), [second, first], "2026-01-31");
    assert.equal(rateMap(mid.rateCard).get("streaming|WW"), "0.32");
    assert.deepEqual(mid.appliedAmendmentIds, [501]);
  });

  it("breaks same-day ties by contract id", () => {
    const lower = doc(amendmentJson(501, "2026-02-01", "0.32"));
    const higher = doc(amendmentJson(502, "2026-02-01", "0.36"));
    const terms = resolveTerms(doc(baseDocJson()), [higher, lower], "2026-02-01");
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.36");
    assert.deepEqual(terms.appliedAmendmentIds, [501, 502]);
  });

  it("keeps a terminated base in force after effective_to", () => {
    const raw = baseDocJson();
    (raw.meta as { effective_to: string }).effective_to = "2026-01-31";
    const terms = resolveTerms(doc(raw), [], "2026-05-31");
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.30");
  });

  it("rejects an amendment passed as the base", () => {
    assert.throws(() => resolveTerms(doc(amendmentJson()), [], "2026-01-01"), /base/);
  });

  it("rejects a base passed as an amendment", () => {
    const base = doc(baseDocJson());
    assert.throws(() => resolveTerms(base, [base], "2026-01-01"), /amendment/);
  });

  it("rejects an amendment that names a section it does not carry", () => {
    const bad = amendmentJson();
    bad.sections = {};
    assert.throws(() => parseTermsDoc(bad), /royalties/);
  });

  it("picks the latest base on or before the date and ignores the previous era's amendments", () => {
    const early = doc(baseDocJson());
    const earlyAmendment = doc(amendmentJson(501, "2024-01-01", "0.40"), 101);
    const laterRaw = baseDocJson();
    (laterRaw.meta as { contract_id: number; effective_from: string }).contract_id = 202;
    (laterRaw.meta as { effective_from: string }).effective_from = "2025-01-01";
    const later = doc(laterRaw);
    const chosen = selectBase([later, earlyAmendment, early], "2026-01-01");
    assert.equal(chosen.contractId, 202);
    const terms = resolveArtistTerms([early, earlyAmendment, later], 7, "2026-01-01");
    assert.equal(rateMap(terms.rateCard).get("streaming|WW"), "0.30");
    assert.equal(terms.contractId, 202);
    assert.deepEqual(terms.appliedAmendmentIds, []);
  });
});

describe("validation", () => {
  it("rejects an empty territory", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { territory: string }[] } }).royalties.rate_card[0] as { territory: string }).territory = "";
    assert.throws(() => parseTermsDoc(bad), /territory/);
  });

  it("rejects a rate above one", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { rate: string }[] } }).royalties.rate_card[0] as { rate: string }).rate = "1.01";
    assert.throws(() => parseTermsDoc(bad), /rate/);
  });

  it("rejects a duplicate rate entry", () => {
    const bad = baseDocJson();
    const card = (bad.sections as { royalties: { rate_card: unknown[] } }).royalties.rate_card;
    card.push(structuredClone(card[0]));
    assert.throws(() => parseTermsDoc(bad), /duplicate/);
  });

  it("rejects a negative escalator threshold", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { escalators: { threshold_usd: string }[] } }).royalties.escalators[0] as { threshold_usd: string }).threshold_usd = "-1";
    assert.throws(() => parseTermsDoc(bad), /threshold/);
  });

  it("rejects a negative escalator bump", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { escalators: { bump: string }[] } }).royalties.escalators[0] as { bump: string }).bump = "-0.01";
    assert.throws(() => parseTermsDoc(bad), /bump/);
  });

  it("rejects a non-string excluded territory", () => {
    const bad = baseDocJson();
    (bad.sections as { term_territory: { excluded_territories: unknown[] } }).term_territory.excluded_territories = [7];
    assert.throws(() => parseTermsDoc(bad), /excluded_territories/);
  });

  it("rejects an empty account", () => {
    const bad = baseDocJson();
    (bad.sections as { advances_recoupment: { account: string } }).advances_recoupment.account = "";
    assert.throws(() => parseTermsDoc(bad), /account/);
  });

  it("rejects a non-string recoupable class", () => {
    const bad = baseDocJson();
    (bad.sections as { advances_recoupment: { recoupable_classes: unknown[] } }).advances_recoupment.recoupable_classes = [1];
    assert.throws(() => parseTermsDoc(bad), /recoupable_classes/);
  });

  it("rejects a negative minimum guarantee", () => {
    const bad = baseDocJson();
    (bad.sections as { advances_recoupment: { minimum_guarantee_per_period: string } }).advances_recoupment.minimum_guarantee_per_period = "-100";
    assert.throws(() => parseTermsDoc(bad), /minimum_guarantee/);
  });

  it("rejects replaced sections on a base", () => {
    const bad = baseDocJson();
    (bad.meta as { replaced_sections: string[] }).replaced_sections = ["royalties"];
    assert.throws(() => parseTermsDoc(bad), /base contracts do not replace/);
  });

  it("rejects a base missing a required section", () => {
    const bad = baseDocJson();
    delete (bad.sections as { advances_recoupment?: unknown }).advances_recoupment;
    assert.throws(() => parseTermsDoc(bad), /advances_recoupment/);
  });

  it("rejects an amendment with no replaced sections", () => {
    const bad = amendmentJson();
    (bad.meta as { replaced_sections: string[] }).replaced_sections = [];
    assert.throws(() => parseTermsDoc(bad), /replaced_sections/);
  });

  it("rejects an unknown replaced section", () => {
    const bad = amendmentJson();
    (bad.meta as { replaced_sections: string[] }).replaced_sections = ["appendix"];
    assert.throws(() => parseTermsDoc(bad), /appendix/);
  });

  it("rejects an extra section on an amendment", () => {
    const bad = amendmentJson();
    (bad.sections as Record<string, unknown>).term_territory = { excluded_territories: [] };
    assert.throws(() => parseTermsDoc(bad), /match replaced_sections/);
  });

  it("accepts an integer decimal field and keeps its canonical string", () => {
    const raw = baseDocJson();
    ((raw.sections as { royalties: { escalators: { threshold_usd: unknown }[] } }).royalties.escalators[0] as { threshold_usd: unknown }).threshold_usd = 250000;
    const terms = resolveTerms(doc(raw), [], "2026-01-01");
    assert.equal(terms.escalators[0]?.thresholdUsd, "250000");
  });

  it("rejects a garbage decimal string", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { rate: string }[] } }).royalties.rate_card[0] as { rate: string }).rate = "thirty percent";
    assert.throws(() => parseTermsDoc(bad), /not a decimal/);
  });

  it("rejects a non-scalar decimal", () => {
    const bad = baseDocJson();
    ((bad.sections as { royalties: { rate_card: { rate: unknown }[] } }).royalties.rate_card[0] as { rate: unknown }).rate = ["0.30"];
    assert.throws(() => parseTermsDoc(bad), { name: "TypeError", message: /list/ });
  });
});
