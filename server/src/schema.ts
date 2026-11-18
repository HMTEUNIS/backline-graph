import SchemaBuilder from "@pothos/core";

import type { ArtistField, FieldEdge, FieldNode } from "./field.js";
import type { ArtistRow, World } from "./load.js";
import { allArtists, artistById, contractsForArtist } from "./resolvers/artist.js";
import { contractById } from "./resolvers/contract.js";
import { contractField } from "./resolvers/contractField.js";
import { resolvedTerms } from "./resolvers/resolvedTerms.js";
import { presentTerms, type PresentedTerms, type ResolvedTerms, type TermsDoc } from "./terms.js";

export type GraphContext = { world: World };

type AmendmentView = {
  amendmentId: number;
  supersedesContractId: number;
  replacedSections: string[];
};

const builder = new SchemaBuilder<{
  Context: GraphContext;
  Defaults: "v3";
}>({
  defaults: "v3",
});

const ContractKind = builder.enumType("ContractKind", {
  values: {
    BASE: { value: "BASE" },
    AMENDMENT: { value: "AMENDMENT" },
  } as const,
});

const RateEntryRef = builder.objectRef<{ revenueType: string; territory: string; rate: string }>("RateEntry");
const EscalatorRef = builder.objectRef<{ thresholdUsd: string; bump: string }>("Escalator");
const TermTerritoryRef = builder.objectRef<{ excludedTerritories: string[] }>("TermTerritory");
const RoyaltiesRef = builder.objectRef<{ rateCard: { revenueType: string; territory: string; rate: string }[]; escalators: { thresholdUsd: string; bump: string }[] }>("Royalties");
const AdvancesRef = builder.objectRef<{ account: string; recoupableClasses: string[]; minimumGuaranteePerPeriod: string | null }>("AdvancesRecoupment");
const TermsMetaRef = builder.objectRef<PresentedTerms["meta"]>("TermsMeta");
const TermsSectionsRef = builder.objectRef<PresentedTerms["sections"]>("TermsSections");
const ContractTermsRef = builder.objectRef<PresentedTerms>("ContractTerms");
const AmendmentRef = builder.objectRef<AmendmentView>("Amendment");
const ArtistRef = builder.objectRef<ArtistRow>("Artist");
const ContractRef = builder.objectRef<TermsDoc>("Contract");
const ResolvedRef = builder.objectRef<ResolvedTerms>("ResolvedTerms");
const FieldNodeRef = builder.objectRef<FieldNode>("FieldNode");
const FieldEdgeRef = builder.objectRef<FieldEdge>("FieldEdge");
const ArtistFieldRef = builder.objectRef<ArtistField>("ArtistField");

RateEntryRef.implement({
  fields: (t) => ({
    revenueType: t.exposeString("revenueType"),
    territory: t.exposeString("territory"),
    rate: t.exposeString("rate"),
  }),
});

EscalatorRef.implement({
  fields: (t) => ({
    thresholdUsd: t.exposeString("thresholdUsd"),
    bump: t.exposeString("bump"),
  }),
});

TermTerritoryRef.implement({
  fields: (t) => ({
    excludedTerritories: t.exposeStringList("excludedTerritories"),
  }),
});

RoyaltiesRef.implement({
  fields: (t) => ({
    rateCard: t.field({ type: [RateEntryRef], resolve: (row) => row.rateCard }),
    escalators: t.field({ type: [EscalatorRef], resolve: (row) => row.escalators }),
  }),
});

AdvancesRef.implement({
  fields: (t) => ({
    account: t.exposeString("account"),
    recoupableClasses: t.exposeStringList("recoupableClasses"),
    minimumGuaranteePerPeriod: t.string({
      nullable: true,
      resolve: (row) => row.minimumGuaranteePerPeriod,
    }),
  }),
});

TermsMetaRef.implement({
  fields: (t) => ({
    contractId: t.exposeInt("contractId"),
    artistId: t.exposeInt("artistId"),
    kind: t.exposeString("kind"),
    effectiveFrom: t.exposeString("effectiveFrom"),
    effectiveTo: t.string({ nullable: true, resolve: (row) => row.effectiveTo }),
    replacedSections: t.exposeStringList("replacedSections"),
  }),
});

TermsSectionsRef.implement({
  fields: (t) => ({
    termTerritory: t.field({
      type: TermTerritoryRef,
      nullable: true,
      resolve: (row) => row.termTerritory,
    }),
    royalties: t.field({ type: RoyaltiesRef, nullable: true, resolve: (row) => row.royalties }),
    advancesRecoupment: t.field({
      type: AdvancesRef,
      nullable: true,
      resolve: (row) => row.advancesRecoupment,
    }),
  }),
});

ContractTermsRef.implement({
  fields: (t) => ({
    meta: t.field({ type: TermsMetaRef, resolve: (row) => row.meta }),
    sections: t.field({ type: TermsSectionsRef, resolve: (row) => row.sections }),
  }),
});

AmendmentRef.implement({
  fields: (t) => ({
    amendmentId: t.exposeInt("amendmentId"),
    supersedesContractId: t.exposeInt("supersedesContractId"),
    replacedSections: t.exposeStringList("replacedSections"),
  }),
});

ArtistRef.implement({
  fields: (t) => ({
    id: t.exposeInt("id"),
    stageName: t.exposeString("stageName"),
    legalName: t.exposeString("legalName"),
    joinedAt: t.exposeString("joinedAt"),
    country: t.exposeString("country"),
    contracts: t.field({
      type: [ContractRef],
      resolve: (artist, _args, ctx) => contractsForArtist(ctx.world, artist.id),
    }),
  }),
});

ContractRef.implement({
  fields: (t) => ({
    id: t.int({ resolve: (doc) => doc.contractId }),
    artistId: t.exposeInt("artistId"),
    docPath: t.exposeString("docPath"),
    sourcePath: t.string({ nullable: true, resolve: (doc) => doc.sourcePath }),
    effectiveFrom: t.exposeString("effectiveFrom"),
    effectiveTo: t.string({ nullable: true, resolve: (doc) => doc.effectiveTo }),
    kind: t.field({
      type: ContractKind,
      resolve: (doc) => (doc.kind === "base" ? "BASE" : "AMENDMENT"),
    }),
    terms: t.field({ type: ContractTermsRef, resolve: (doc) => presentTerms(doc) }),
    amendment: t.field({
      type: AmendmentRef,
      nullable: true,
      resolve: (doc) =>
        doc.kind === "amendment" && doc.supersedesContractId !== null
          ? {
              amendmentId: doc.contractId,
              supersedesContractId: doc.supersedesContractId,
              replacedSections: [...doc.replacedSections],
            }
          : null,
    }),
    rawTerms: t.string({ resolve: (doc) => JSON.stringify(doc.raw, null, 2) }),
  }),
});

ResolvedRef.implement({
  fields: (t) => ({
    artistId: t.exposeInt("artistId"),
    asOf: t.exposeString("asOf"),
    contractId: t.exposeInt("contractId"),
    appliedAmendmentIds: t.exposeIntList("appliedAmendmentIds"),
    rateCard: t.field({ type: [RateEntryRef], resolve: (row) => row.rateCard }),
    escalators: t.field({ type: [EscalatorRef], resolve: (row) => row.escalators }),
    account: t.exposeString("account"),
    recoupableClasses: t.exposeStringList("recoupableClasses"),
    minimumGuaranteePerPeriod: t.string({
      nullable: true,
      resolve: (row) => row.minimumGuaranteePerPeriod,
    }),
    excludedTerritories: t.exposeStringList("excludedTerritories"),
  }),
});

FieldNodeRef.implement({
  fields: (t) => ({
    contractId: t.exposeInt("contractId"),
    effectiveFrom: t.exposeString("effectiveFrom"),
    effectiveTo: t.string({ nullable: true, resolve: (node) => node.effectiveTo }),
    kind: t.field({ type: ContractKind, resolve: (node) => node.kind }),
    resolvedRate: t.float({ nullable: true, resolve: (node) => node.resolvedRate }),
    rates: t.field({ type: [RateEntryRef], resolve: (node) => node.rates }),
    docPath: t.exposeString("docPath"),
    sourcePath: t.string({ nullable: true, resolve: (node) => node.sourcePath }),
    rawTerms: t.exposeString("rawTerms"),
  }),
});

FieldEdgeRef.implement({
  fields: (t) => ({
    fromContractId: t.exposeInt("fromContractId"),
    toContractId: t.exposeInt("toContractId"),
    effectiveFrom: t.exposeString("effectiveFrom"),
    replacedSections: t.exposeStringList("replacedSections"),
    rateDelta: t.float({ nullable: true, resolve: (edge) => edge.rateDelta }),
  }),
});

ArtistFieldRef.implement({
  fields: (t) => ({
    artist: t.field({ type: ArtistRef, resolve: (row) => row.artist }),
    nodes: t.field({ type: [FieldNodeRef], resolve: (row) => row.nodes }),
    edges: t.field({ type: [FieldEdgeRef], resolve: (row) => row.edges }),
  }),
});

builder.queryType({
  fields: (t) => ({
    artist: t.field({
      type: ArtistRef,
      nullable: true,
      args: { id: t.arg.int({ required: true }) },
      resolve: (_root, args, ctx) => artistById(ctx.world, args.id),
    }),
    artists: t.field({
      type: [ArtistRef],
      resolve: (_root, _args, ctx) => allArtists(ctx.world),
    }),
    contract: t.field({
      type: ContractRef,
      nullable: true,
      args: { id: t.arg.int({ required: true }) },
      resolve: (_root, args, ctx) => contractById(ctx.world, args.id),
    }),
    resolvedTerms: t.field({
      type: ResolvedRef,
      args: {
        artistId: t.arg.int({ required: true }),
        asOf: t.arg.string({ required: true }),
      },
      resolve: (_root, args, ctx) => resolvedTerms(ctx.world, args.artistId, args.asOf),
    }),
    contractField: t.field({
      type: [ArtistFieldRef],
      resolve: (_root, _args, ctx) => contractField(ctx.world),
    }),
  }),
});

export const schema = builder.toSchema();
