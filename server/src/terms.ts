/**
 * Port of backline/royaltycalc/terms.py.
 *
 * Amendments replace a named section wholesale. Effective date orders them,
 * then contract id. A base's effective_to does not retire it: post-term
 * revenue still uses the last governing terms.
 *
 * Rates stay strings. Floats are rejected, matching the Python parser.
 */

import { Decimal } from "decimal.js";

export const REVENUE_TYPES = new Set(["streaming", "download", "physical", "sync"]);

export const SECTION_TERM_TERRITORY = "term_territory";
export const SECTION_ROYALTIES = "royalties";
export const SECTION_ADVANCES = "advances_recoupment";
export const SECTION_KEYS = [SECTION_TERM_TERRITORY, SECTION_ROYALTIES, SECTION_ADVANCES] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
export type ContractKind = "base" | "amendment";

export type RateEntry = {
  revenueType: string;
  territory: string;
  rate: string;
};

export type Escalator = {
  thresholdUsd: string;
  bump: string;
};

export type TermsSections = {
  term_territory?: { excluded_territories?: unknown };
  royalties?: { rate_card?: unknown; escalators?: unknown };
  advances_recoupment?: {
    account?: unknown;
    recoupable_classes?: unknown;
    minimum_guarantee_per_period?: unknown;
  };
};

export type TermsDoc = {
  contractId: number;
  artistId: number;
  kind: ContractKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  replacedSections: SectionKey[];
  sections: TermsSections;
  supersedesContractId: number | null;
  docPath: string;
  /** Relative PDF path from Patchbay. No host or bucket. Null when the row has none. */
  sourcePath: string | null;
  raw: unknown;
};

export type ResolvedTerms = {
  artistId: number;
  asOf: string;
  contractId: number;
  appliedAmendmentIds: number[];
  rateCard: RateEntry[];
  escalators: Escalator[];
  account: string;
  recoupableClasses: string[];
  minimumGuaranteePerPeriod: string | null;
  excludedTerritories: string[];
};

export type PresentedTerms = {
  meta: {
    contractId: number;
    artistId: number;
    kind: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    replacedSections: string[];
  };
  sections: {
    termTerritory: { excludedTerritories: string[] } | null;
    royalties: { rateCard: RateEntry[]; escalators: Escalator[] } | null;
    advancesRecoupment: {
      account: string;
      recoupableClasses: string[];
      minimumGuaranteePerPeriod: string | null;
    } | null;
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field}: not an ISO date: ${value}`);
  }
}

function typeName(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return typeof value;
}

function dec(value: unknown, field: string): Decimal {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new TypeError(`${field}: decimal quantities must be strings in terms JSON, not float`);
  }
  if (typeof value === "string" || (typeof value === "number" && Number.isInteger(value))) {
    try {
      return new Decimal(value);
    } catch {
      throw new Error(`${field}: not a decimal: ${JSON.stringify(value)}`);
    }
  }
  throw new TypeError(`${field}: cannot read ${typeName(value)} as Decimal`);
}

function canonical(value: unknown, field: string): string {
  dec(value, field);
  if (typeof value === "string") return value;
  return String(value);
}

function isSectionKey(key: string): key is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(key);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function validateRoyalties(section: Record<string, unknown>): void {
  const card = section.rate_card;
  if (!Array.isArray(card)) throw new Error("rate_card: expected a list");
  const seen = new Set<string>();
  for (const entry of card) {
    const row = asRecord(entry, "rate card entry");
    const revenueType = row.revenue_type;
    if (typeof revenueType !== "string" || !REVENUE_TYPES.has(revenueType)) {
      throw new Error(`unknown revenue_type ${JSON.stringify(revenueType)}`);
    }
    const territory = row.territory;
    if (typeof territory !== "string" || territory.length === 0) {
      throw new Error(`bad territory ${JSON.stringify(territory)}`);
    }
    const rate = dec(row.rate, "rate");
    if (rate.lt(0) || rate.gt(1)) throw new Error(`rate out of range [0, 1]: ${rate.toString()}`);
    const key = `${revenueType}\0${territory}`;
    if (seen.has(key)) throw new Error(`duplicate rate card entry for ('${revenueType}', '${territory}')`);
    seen.add(key);
  }
  const escalators = section.escalators ?? [];
  if (!Array.isArray(escalators)) throw new Error("escalators: expected a list");
  for (const esc of escalators) {
    const row = asRecord(esc, "escalator");
    if (dec(row.threshold_usd, "threshold_usd").lt(0)) {
      throw new Error("escalator threshold_usd must be >= 0");
    }
    if (dec(row.bump, "bump").lt(0)) throw new Error("escalator bump must be >= 0");
  }
}

function validateSection(key: SectionKey, section: Record<string, unknown>): void {
  if (key === SECTION_TERM_TERRITORY) {
    const excluded = section.excluded_territories ?? [];
    if (!Array.isArray(excluded) || excluded.some((item) => typeof item !== "string")) {
      throw new Error("excluded_territories must be strings");
    }
    return;
  }
  if (key === SECTION_ROYALTIES) {
    validateRoyalties(section);
    return;
  }
  const account = section.account;
  if (typeof account !== "string" || account.length === 0) {
    throw new Error(`bad recoupment account ${JSON.stringify(account)}`);
  }
  const classes = section.recoupable_classes;
  if (!Array.isArray(classes) || classes.some((item) => typeof item !== "string")) {
    throw new Error("recoupable_classes must be strings");
  }
  const guarantee = section.minimum_guarantee_per_period;
  if (guarantee != null && dec(guarantee, "minimum_guarantee_per_period").lt(0)) {
    throw new Error("minimum_guarantee_per_period must be >= 0");
  }
}

export function parseTermsDoc(obj: unknown): TermsDoc {
  const root = asRecord(obj, "terms");
  const meta = asRecord(root.meta, "meta");
  const kind = meta.kind;
  if (kind !== "base" && kind !== "amendment") {
    throw new Error(`unknown contract kind ${JSON.stringify(kind)}`);
  }
  const sectionsRaw = asRecord(root.sections, "sections");
  for (const key of Object.keys(sectionsRaw)) {
    if (!isSectionKey(key)) throw new Error(`unknown section ${JSON.stringify(key)}`);
    validateSection(key, asRecord(sectionsRaw[key], key));
  }
  const replacedRaw = meta.replaced_sections ?? [];
  if (!Array.isArray(replacedRaw)) throw new Error("replaced_sections must be a list");
  const replaced: SectionKey[] = [];
  for (const key of replacedRaw) {
    if (typeof key !== "string" || !isSectionKey(key)) {
      throw new Error(`unknown replaced section ${JSON.stringify(key)}`);
    }
    replaced.push(key);
  }
  if (kind === "base") {
    if (replaced.length > 0) throw new Error("base contracts do not replace sections");
    for (const required of [SECTION_ROYALTIES, SECTION_ADVANCES]) {
      if (!(required in sectionsRaw)) {
        throw new Error(`base contract missing required section ${JSON.stringify(required)}`);
      }
    }
  } else {
    if (replaced.length === 0) throw new Error("amendment must name replaced_sections");
    for (const key of replaced) {
      if (!(key in sectionsRaw)) {
        throw new Error(`amendment replaces ${JSON.stringify(key)} but carries no such section`);
      }
    }
    const sectionKeys = Object.keys(sectionsRaw);
    if (sectionKeys.length !== replaced.length || sectionKeys.some((key) => !replaced.includes(key as SectionKey))) {
      throw new Error("amendment sections must match replaced_sections exactly");
    }
  }
  const effectiveFrom = meta.effective_from;
  if (typeof effectiveFrom !== "string") throw new Error("effective_from: not an ISO date");
  assertIsoDate(effectiveFrom, "effective_from");
  const effectiveToRaw = meta.effective_to ?? null;
  const effectiveTo = effectiveToRaw === null ? null : String(effectiveToRaw);
  if (effectiveTo !== null) assertIsoDate(effectiveTo, "effective_to");
  const contractId = Number(meta.contract_id);
  const artistId = Number(meta.artist_id);
  if (!Number.isInteger(contractId) || !Number.isInteger(artistId)) {
    throw new Error("contract_id and artist_id must be integers");
  }
  return {
    contractId,
    artistId,
    kind,
    effectiveFrom,
    effectiveTo,
    replacedSections: replaced,
    sections: structuredClone(sectionsRaw) as TermsSections,
    supersedesContractId: null,
    docPath: "",
    sourcePath: null,
    raw: structuredClone(root),
  };
}

export function docToJson(doc: TermsDoc): Record<string, unknown> {
  return {
    meta: {
      contract_id: doc.contractId,
      artist_id: doc.artistId,
      kind: doc.kind,
      effective_from: doc.effectiveFrom,
      effective_to: doc.effectiveTo,
      replaced_sections: [...doc.replacedSections],
    },
    sections: structuredClone(doc.sections),
  };
}

function readRateCard(section: Record<string, unknown>): RateEntry[] {
  const card = section.rate_card;
  if (!Array.isArray(card)) throw new Error("rate_card: expected a list");
  return card.map((entry) => {
    const row = asRecord(entry, "rate card entry");
    const revenueType = row.revenue_type;
    const territory = row.territory;
    if (typeof revenueType !== "string" || typeof territory !== "string") {
      throw new Error("rate card entry is missing revenue_type or territory");
    }
    return { revenueType, territory, rate: canonical(row.rate, "rate") };
  });
}

function readEscalators(section: Record<string, unknown>): Escalator[] {
  const escalators = section.escalators ?? [];
  if (!Array.isArray(escalators)) throw new Error("escalators: expected a list");
  return escalators
    .map((entry) => {
      const row = asRecord(entry, "escalator");
      return {
        thresholdUsd: canonical(row.threshold_usd, "threshold_usd"),
        bump: canonical(row.bump, "bump"),
      };
    })
    .sort((a, b) => new Decimal(a.thresholdUsd).comparedTo(b.thresholdUsd));
}

export function resolveTerms(base: TermsDoc, amendments: readonly TermsDoc[], asOf: string): ResolvedTerms {
  assertIsoDate(asOf, "asOf");
  if (base.kind !== "base") {
    throw new Error(`contract ${base.contractId} is not a base contract`);
  }
  const sections: TermsSections = structuredClone(base.sections);
  const applicable = amendments
    .filter((amendment) => amendment.effectiveFrom <= asOf)
    .slice()
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.contractId - b.contractId);
  const appliedAmendmentIds: number[] = [];
  for (const amendment of applicable) {
    if (amendment.kind !== "amendment") {
      throw new Error(`contract ${amendment.contractId} is not an amendment`);
    }
    for (const key of amendment.replacedSections) {
      const next = amendment.sections[key];
      if (next === undefined) {
        throw new Error(`amendment replaces ${JSON.stringify(key)} but carries no such section`);
      }
      sections[key] = structuredClone(next);
    }
    appliedAmendmentIds.push(amendment.contractId);
  }
  const royalties = asRecord(sections.royalties, SECTION_ROYALTIES);
  const advances = asRecord(sections.advances_recoupment, SECTION_ADVANCES);
  const territory = sections.term_territory;
  const excluded = territory?.excluded_territories ?? [];
  if (!Array.isArray(excluded) || excluded.some((item) => typeof item !== "string")) {
    throw new Error("excluded_territories must be strings");
  }
  const account = advances.account;
  if (typeof account !== "string" || account.length === 0) {
    throw new Error(`bad recoupment account ${JSON.stringify(account)}`);
  }
  const classes = advances.recoupable_classes;
  if (!Array.isArray(classes) || classes.some((item) => typeof item !== "string")) {
    throw new Error("recoupable_classes must be strings");
  }
  const guarantee = advances.minimum_guarantee_per_period;
  return {
    artistId: base.artistId,
    asOf,
    contractId: base.contractId,
    appliedAmendmentIds,
    rateCard: readRateCard(royalties),
    escalators: readEscalators(royalties),
    account,
    recoupableClasses: classes,
    minimumGuaranteePerPeriod:
      guarantee == null ? null : canonical(guarantee, "minimum_guarantee_per_period"),
    excludedTerritories: excluded,
  };
}

export function selectBase(docs: readonly TermsDoc[], asOf: string): TermsDoc {
  const bases = docs.filter((doc) => doc.kind === "base" && doc.effectiveFrom <= asOf);
  if (bases.length === 0) {
    throw new Error(`no base contract effective on or before ${asOf}`);
  }
  bases.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.contractId - a.contractId);
  const base = bases[0];
  if (!base) throw new Error(`no base contract effective on or before ${asOf}`);
  return base;
}

export function resolveArtistTerms(docs: readonly TermsDoc[], artistId: number, asOf: string): ResolvedTerms {
  const mine = docs.filter((doc) => doc.artistId === artistId);
  const base = selectBase(mine, asOf);
  const amendments = mine.filter(
    (doc) => doc.kind === "amendment" && doc.supersedesContractId === base.contractId,
  );
  return resolveTerms(base, amendments, asOf);
}

export function presentTerms(doc: TermsDoc): PresentedTerms {
  const royalties = doc.sections.royalties;
  const advances = doc.sections.advances_recoupment;
  const territory = doc.sections.term_territory;
  const excluded = territory?.excluded_territories ?? [];
  return {
    meta: {
      contractId: doc.contractId,
      artistId: doc.artistId,
      kind: doc.kind,
      effectiveFrom: doc.effectiveFrom,
      effectiveTo: doc.effectiveTo,
      replacedSections: [...doc.replacedSections],
    },
    sections: {
      termTerritory:
        territory === undefined
          ? null
          : { excludedTerritories: Array.isArray(excluded) ? excluded.filter((item) => typeof item === "string") : [] },
      royalties: royalties
        ? { rateCard: readRateCard(asRecord(royalties, "royalties")), escalators: readEscalators(asRecord(royalties, "royalties")) }
        : null,
      advancesRecoupment: advances
        ? {
            account: String(asRecord(advances, "advances_recoupment").account),
            recoupableClasses: (asRecord(advances, "advances_recoupment").recoupable_classes as string[]) ?? [],
            minimumGuaranteePerPeriod:
              asRecord(advances, "advances_recoupment").minimum_guarantee_per_period == null
                ? null
                : canonical(
                    asRecord(advances, "advances_recoupment").minimum_guarantee_per_period,
                    "minimum_guarantee_per_period",
                  ),
          }
        : null,
    },
  };
}

export function streamingWw(card: readonly RateEntry[]): number | null {
  const hit = card.find((entry) => entry.revenueType === "streaming" && entry.territory === "WW");
  if (!hit) return null;
  const value = new Decimal(hit.rate);
  if (!value.isFinite()) return null;
  return value.toNumber();
}
