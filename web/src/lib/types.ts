export type Metric = "streaming" | "download" | "physical" | "sync";

export type RateEntry = {
  revenueType: string;
  territory: string;
  rate: string;
};

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

export type Artist = {
  id: number;
  stageName: string;
  legalName: string;
  joinedAt: string;
  country: string;
};

export type ArtistField = {
  artist: Artist;
  nodes: FieldNode[];
  edges: FieldEdge[];
};

export type Citation = {
  type: "node";
  contractId: number;
  field: "resolvedRate" | "rateDelta";
};

export const METRICS: { id: Metric; label: string }[] = [
  { id: "streaming", label: "Streaming" },
  { id: "download", label: "Download" },
  { id: "physical", label: "Physical" },
  { id: "sync", label: "Sync" },
];

export function wwRate(node: FieldNode, metric: Metric): string | null {
  const hit = node.rates.find((entry) => entry.revenueType === metric && entry.territory === "WW");
  return hit?.rate ?? null;
}

export function contractLabel(node: Pick<FieldNode, "contractId" | "docPath" | "kind">): string {
  const coded = node.docPath.match(/FBR-[CA]-\d{5}/);
  if (coded) return coded[0];
  const file = node.docPath.split("/").pop()?.replace(/\.pdf$/i, "");
  return file && file.length > 0 ? file : `contract ${node.contractId}`;
}

export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}
