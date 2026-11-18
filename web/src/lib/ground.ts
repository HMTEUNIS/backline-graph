import type { ArtistField, Citation, FieldNode, Metric } from "./types";
import { contractLabel, wwRate } from "./types";

export type GraphAnswer = {
  text: string;
  citations: Citation[];
  source: "graph";
  metric: Metric | null;
};

const CUT =
  /\b(cut|cuts|decreased|decreases|decreasing|decrease|reduced|reduces|reducing|reduction|lowered|lowers|lowering|lower|dropped|drops|dropping|drop|fell|fallen|fall)\b/;
const RISE = /\b(increased|increases|increasing|increase|raised|raises|raising|raise|rose|risen|rise|bumped|bumps|bump|higher)\b/;
const ABOUT = /\b(rates?|royalt(?:y|ies)|streaming|downloads?|physical|sync|contracts?|amendments?|terms?)\b/;

type Step = {
  artist: ArtistField;
  previous: FieldNode;
  next: FieldNode;
  previousRate: string;
  nextRate: string;
};

function metricNamed(question: string): Metric | null {
  if (/\bdownloads?\b/.test(question)) return "download";
  if (/\bphysical\b/.test(question)) return "physical";
  if (/\bsync\b/.test(question)) return "sync";
  if (/\bstreaming\b/.test(question)) return "streaming";
  return null;
}

function dateNamed(question: string): string | null {
  return question.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
}

function artistsNamed(question: string, field: readonly ArtistField[]): ArtistField[] {
  const found = new Map<number, ArtistField>();
  for (const artist of field) {
    if (question.includes(artist.artist.stageName.toLowerCase())) found.set(artist.artist.id, artist);
  }
  for (const match of question.matchAll(/\bartist\s+#?(\d+)\b/g)) {
    const id = Number(match[1]);
    const artist = field.find((item) => item.artist.id === id);
    if (artist) found.set(id, artist);
  }
  return [...found.values()].sort((a, b) => a.artist.id - b.artist.id);
}

function points(rate: string): number {
  return Math.round(Number(rate) * 1_000_000);
}

function stepsOf(artists: readonly ArtistField[], metric: Metric, asOf: string | null, direction: "cut" | "rise"): Step[] {
  const found: Step[] = [];
  for (const artist of artists) {
    const pointsInTime = artist.nodes
      .filter((node) => asOf === null || node.effectiveFrom <= asOf)
      .flatMap((node) => {
        const rate = wwRate(node, metric);
        return rate === null ? [] : [{ node, rate }];
      })
      .sort((a, b) => a.node.effectiveFrom.localeCompare(b.node.effectiveFrom) || a.node.contractId - b.node.contractId);
    for (let index = 1; index < pointsInTime.length; index += 1) {
      const previous = pointsInTime[index - 1];
      const next = pointsInTime[index];
      if (!previous || !next) continue;
      const delta = points(next.rate) - points(previous.rate);
      const hit = direction === "cut" ? delta < 0 : delta > 0;
      if (!hit) continue;
      found.push({
        artist,
        previous: previous.node,
        next: next.node,
        previousRate: previous.rate,
        nextRate: next.rate,
      });
    }
  }
  return found;
}

function citeStep(step: Step): Citation[] {
  const amendment = step.artist.edges.some((edge) => edge.toContractId === step.next.contractId);
  return [
    { type: "node", contractId: step.previous.contractId, field: "resolvedRate" },
    { type: "node", contractId: step.next.contractId, field: amendment ? "rateDelta" : "resolvedRate" },
  ];
}

function describeChange(steps: readonly Step[], metric: Metric, asOf: string | null, direction: "cut" | "rise"): GraphAnswer {
  const word = direction === "cut" ? "lower" : "higher";
  const when = asOf ? ` on or before ${asOf}` : "";
  if (steps.length === 0) {
    return {
      text: `No artist in this field has a ${word} ${metric} WW rate than the previous contract${when}. Compared consecutive contracts that both publish a ${metric} WW rate; every step is flat or the other way.`,
      citations: [],
      source: "graph",
      metric: null,
    };
  }
  const artistCount = new Set(steps.map((step) => step.artist.artist.id)).size;
  const lines = steps.map(
    (step) =>
      `${step.artist.artist.stageName} (artist ${step.artist.artist.id}): ${step.previousRate} on ${contractLabel(step.previous)} → ${step.nextRate} on ${contractLabel(step.next)} (${step.next.effectiveFrom}).`,
  );
  return {
    text: `${steps.length} ${word} ${metric} WW step${steps.length === 1 ? "" : "s"} across ${artistCount} artist${artistCount === 1 ? "" : "s"}${when}.\n\n${lines.join("\n")}`,
    citations: steps.flatMap(citeStep),
    source: "graph",
    metric: null,
  };
}

function governing(artist: ArtistField, asOf: string): FieldNode | null {
  return (
    artist.nodes
      .filter((node) => node.effectiveFrom <= asOf)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.contractId - a.contractId)[0] ?? null
  );
}

function summarize(artists: readonly ArtistField[], metric: Metric, asOf: string | null): GraphAnswer {
  const blocks = artists.map((artist) => {
    const nodes = artist.nodes
      .filter((node) => asOf === null || node.effectiveFrom <= asOf)
      .slice()
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.contractId - b.contractId);
    if (asOf && nodes.length === 0) {
      return `${artist.artist.stageName} (artist ${artist.artist.id}) has no contract effective on or before ${asOf}.`;
    }
    if (asOf) {
      const node = governing(artist, asOf);
      if (!node) return `${artist.artist.stageName} has no contract effective on or before ${asOf}.`;
      const rate = wwRate(node, metric);
      return `On ${asOf}, ${artist.artist.stageName} (artist ${artist.artist.id}) is on ${contractLabel(node)} (effective ${node.effectiveFrom}). ${metric} WW is ${rate ?? "not on the card"}.`;
    }
    const lines = nodes.map((node) => {
      const rate = wwRate(node, metric);
      const kind = node.kind === "BASE" ? "base" : "amendment";
      return `- ${node.effectiveFrom} ${kind} ${contractLabel(node)} — ${metric} WW ${rate ?? "n/a"}`;
    });
    return `${artist.artist.stageName} (artist ${artist.artist.id}), ${metric} WW:\n${lines.join("\n")}`;
  });
  const citations: Citation[] = [];
  for (const artist of artists) {
    for (const node of artist.nodes) {
      if (asOf !== null && node.effectiveFrom > asOf) continue;
      if (asOf !== null && governing(artist, asOf)?.contractId !== node.contractId) continue;
      citations.push({ type: "node", contractId: node.contractId, field: "resolvedRate" });
    }
  }
  return { text: blocks.join("\n\n"), citations, source: "graph", metric: null };
}

export function tryGraphAnswer(question: string, field: readonly ArtistField[], metric: Metric): GraphAnswer | null {
  const q = question.toLowerCase();
  const cut = CUT.test(q);
  const rise = RISE.test(q);
  const about = ABOUT.test(q);
  if (cut && rise) return null;
  if (!cut && !rise && !about) return null;
  const chosen = metricNamed(q) ?? metric;
  const asOf = dateNamed(q);
  const named = artistsNamed(q, field);
  const scope = named.length > 0 ? named : field;
  if (cut || rise) {
    const answer = describeChange(stepsOf(scope, chosen, asOf, cut ? "cut" : "rise"), chosen, asOf, cut ? "cut" : "rise");
    return { ...answer, metric: metricNamed(q) };
  }
  if (named.length === 0) return null;
  const answer = summarize(named, chosen, asOf);
  return { ...answer, metric: metricNamed(q) };
}

export function citeAgentText(text: string, refs: readonly string[], field: readonly ArtistField[]): Citation[] {
  const known = new Set<number>();
  const amendments = new Set<number>();
  for (const artist of field) {
    for (const node of artist.nodes) known.add(node.contractId);
    for (const edge of artist.edges) amendments.add(edge.toContractId);
  }
  const ids = new Set<number>();
  for (const source of [text, ...refs]) {
    for (const match of source.matchAll(/FBR-[CA]-(\d{5})/g)) {
      const id = Number(match[1]);
      if (known.has(id)) ids.add(id);
    }
    for (const match of source.matchAll(/\b(?:contract|amendment|base)\s+#?(\d+)\b/gi)) {
      const id = Number(match[1]);
      if (known.has(id)) ids.add(id);
    }
  }
  return [...ids]
    .sort((a, b) => a - b)
    .map((contractId) => ({
      type: "node" as const,
      contractId,
      field: amendments.has(contractId) ? ("rateDelta" as const) : ("resolvedRate" as const),
    }));
}
