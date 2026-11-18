/**
 * The 3D field: one node per contract, one edge per amendment.
 * resolvedRate is the streaming WW rate at that contract's effective date.
 */

import { resolveArtistTerms, streamingWw, type RateEntry, type ResolvedTerms, type TermsDoc } from "./terms.js";
import type { ArtistRow } from "./load.js";

export type FieldNode = {
  contractId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  kind: "BASE" | "AMENDMENT";
  resolvedRate: number | null;
  rates: RateEntry[];
  rawTerms: string;
  docPath: string;
  sourcePath: string | null;
};

export type FieldEdge = {
  fromContractId: number;
  toContractId: number;
  effectiveFrom: string;
  replacedSections: string[];
  rateDelta: number | null;
};

export type ArtistField = {
  artist: ArtistRow;
  nodes: FieldNode[];
  edges: FieldEdge[];
};

function delta(to: number | null, from: number | null): number | null {
  if (to === null || from === null) return null;
  return to - from;
}

export function buildContractField(artists: readonly ArtistRow[], docs: readonly TermsDoc[]): ArtistField[] {
  const byArtist = new Map<number, TermsDoc[]>();
  for (const doc of docs) {
    const list = byArtist.get(doc.artistId) ?? [];
    list.push(doc);
    byArtist.set(doc.artistId, list);
  }
  return artists
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((artist) => {
      const mine = byArtist.get(artist.id) ?? [];
      const cache = new Map<string, ResolvedTerms>();
      const resolveAt = (asOf: string): ResolvedTerms => {
        const key = `${artist.id}:${asOf}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const value = resolveArtistTerms(mine, artist.id, asOf);
        cache.set(key, value);
        return value;
      };
      const nodes: FieldNode[] = mine
        .slice()
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.contractId - b.contractId)
        .map((doc) => {
          const resolved = resolveAt(doc.effectiveFrom);
          return {
            contractId: doc.contractId,
            effectiveFrom: doc.effectiveFrom,
            effectiveTo: doc.effectiveTo,
            kind: doc.kind === "base" ? "BASE" : "AMENDMENT",
            resolvedRate: streamingWw(resolved.rateCard),
            rates: resolved.rateCard.map((entry) => ({ ...entry })),
            rawTerms: JSON.stringify(doc.raw, null, 2),
            docPath: doc.docPath,
            sourcePath: doc.sourcePath,
          };
        });
      const byId = new Map(nodes.map((node) => [node.contractId, node]));
      const edges: FieldEdge[] = [];
      for (const doc of mine) {
        if (doc.kind !== "amendment" || doc.supersedesContractId === null) continue;
        const from = byId.get(doc.supersedesContractId);
        const to = byId.get(doc.contractId);
        edges.push({
          fromContractId: doc.supersedesContractId,
          toContractId: doc.contractId,
          effectiveFrom: doc.effectiveFrom,
          replacedSections: [...doc.replacedSections],
          rateDelta: delta(to?.resolvedRate ?? null, from?.resolvedRate ?? null),
        });
      }
      edges.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.toContractId - b.toContractId);
      return { artist, nodes, edges };
    });
}
