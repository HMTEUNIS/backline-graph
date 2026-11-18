import type { ArtistField, FieldEdge, FieldNode, Metric } from "./types";
import { dayNumber, wwRate } from "./types";

export const X_SPAN = 48;
export const LANE_GAP = 1.7;
export const RATE_SCALE = 24;

export type LaidNode = {
  contractId: number;
  artistId: number;
  artistName: string;
  position: [number, number, number];
  kind: FieldNode["kind"];
  radius: number;
  rate: string | null;
  missing: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type LaidEdge = {
  key: string;
  from: [number, number, number];
  to: [number, number, number];
  delta: number | null;
  artistName: string;
  edge: FieldEdge;
};

export type YearTick = { iso: string; x: number };

export type FieldLayout = {
  nodes: LaidNode[];
  edges: LaidEdge[];
  years: YearTick[];
  lanes: { artistId: number; name: string; z: number }[];
  depth: number;
  center: [number, number, number];
  minDate: string;
  maxDate: string;
  xOf: (iso: string) => number;
};

export function xOfDate(iso: string, min: string, max: string): number {
  const span = dayNumber(max) - dayNumber(min);
  if (span <= 0) return X_SPAN / 2;
  const t = (dayNumber(iso) - dayNumber(min)) / span;
  return Math.min(1, Math.max(0, t)) * X_SPAN;
}

export function layoutField(field: readonly ArtistField[], metric: Metric, artistId: number | null): FieldLayout {
  const artists = (artistId === null ? field : field.filter((artist) => artist.artist.id === artistId))
    .slice()
    .sort((a, b) => a.artist.id - b.artist.id);
  const dates = artists.flatMap((artist) => artist.nodes.map((node) => node.effectiveFrom));
  const minDate = dates.reduce((min, date) => (date < min ? date : min), dates[0] ?? "2020-01-01");
  const maxDate = dates.reduce((max, date) => (date > max ? date : max), dates[0] ?? "2026-01-01");
  const xOf = (iso: string) => xOfDate(iso, minDate, maxDate);
  const replaced = new Map<number, number>();
  for (const artist of artists) {
    for (const edge of artist.edges) replaced.set(edge.toContractId, edge.replacedSections.length);
  }
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  const lanes: FieldLayout["lanes"] = [];
  artists.forEach((artist, lane) => {
    const z = lane * LANE_GAP;
    lanes.push({ artistId: artist.artist.id, name: artist.artist.stageName, z });
    const bump = new Map<string, number>();
    const placed = new Map<number, LaidNode>();
    const ordered = artist.nodes.slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.contractId - b.contractId);
    for (const node of ordered) {
      const seen = bump.get(node.effectiveFrom) ?? 0;
      bump.set(node.effectiveFrom, seen + 1);
      const rate = wwRate(node, metric);
      const missing = rate === null || !Number.isFinite(Number(rate));
      const laid: LaidNode = {
        contractId: node.contractId,
        artistId: artist.artist.id,
        artistName: artist.artist.stageName,
        position: [xOf(node.effectiveFrom) + seen * 0.35, missing ? 0 : Number(rate) * RATE_SCALE, z],
        kind: node.kind,
        radius: node.kind === "BASE" ? 0.22 : 0.16 + 0.05 * (replaced.get(node.contractId) ?? 1),
        rate: missing ? null : rate,
        missing,
        effectiveFrom: node.effectiveFrom,
        effectiveTo: node.effectiveTo,
      };
      placed.set(node.contractId, laid);
      nodes.push(laid);
    }
    for (const edge of artist.edges) {
      const from = placed.get(edge.fromContractId);
      const to = placed.get(edge.toContractId);
      if (!from || !to) continue;
      const delta = from.rate !== null && to.rate !== null ? Number(to.rate) - Number(from.rate) : null;
      edges.push({
        key: `${edge.fromContractId}-${edge.toContractId}`,
        from: from.position,
        to: to.position,
        delta: delta !== null && Number.isFinite(delta) ? delta : null,
        artistName: artist.artist.stageName,
        edge,
      });
    }
  });
  const depth = Math.max(0, (artists.length - 1) * LANE_GAP);
  const years: YearTick[] = [];
  const firstYear = Number(minDate.slice(0, 4));
  const lastYear = Number(maxDate.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    const iso = `${year}-01-01`;
    if (iso >= minDate && iso <= maxDate) years.push({ iso, x: xOf(iso) });
  }
  return {
    nodes,
    edges,
    years,
    lanes,
    depth,
    center: [X_SPAN / 2, 3, depth / 2],
    minDate,
    maxDate,
    xOf,
  };
}

export function edgeColor(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1e-6) return "#5C5F66";
  return delta > 0 ? "#3ECF8E" : "#E5484D";
}
