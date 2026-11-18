/**
 * Load label.artists, label.contracts, label.contract_terms, label.amendments.
 * No other schema is named here.
 */

import { query } from "./db.js";
import { parseTermsDoc, type TermsDoc } from "./terms.js";

export type ArtistRow = {
  id: number;
  stageName: string;
  legalName: string;
  joinedAt: string;
  country: string;
};

export type LoadedDoc = TermsDoc;

export type World = {
  artists: ArtistRow[];
  docs: LoadedDoc[];
};

type ArtistSql = {
  id: number;
  stage_name: string;
  legal_name: string;
  joined_at: string;
  country: string;
};

type ContractSql = {
  id: number;
  artist_id: number;
  doc_path: string;
  source_path: string | null;
  effective_from: string;
  effective_to: string | null;
  kind: string;
  terms: unknown;
};

type AmendmentSql = {
  amendment_id: number;
  supersedes_contract_id: number;
  replaced_sections: string[];
};

function asKind(value: string, contractId: number): "base" | "amendment" {
  if (value === "base" || value === "amendment") return value;
  throw new Error(`contract ${contractId}: unknown kind ${value}`);
}

export async function loadWorld(): Promise<World> {
  const artists = await query<ArtistSql>(
    `SELECT id, stage_name, legal_name, joined_at::text AS joined_at, country
     FROM label.artists
     ORDER BY id`,
  );
  const contracts = await query<ContractSql>(
    `SELECT c.id, c.artist_id, c.doc_path, c.source_path,
            c.effective_from::text AS effective_from,
            c.effective_to::text AS effective_to,
            c.kind, t.terms
     FROM label.contracts c
     JOIN label.contract_terms t ON t.contract_id = c.id
     ORDER BY c.artist_id, c.effective_from, c.id`,
  );
  const amendments = await query<AmendmentSql>(
    `SELECT amendment_id, supersedes_contract_id, replaced_sections
     FROM label.amendments`,
  );
  const amendmentById = new Map(amendments.rows.map((row) => [row.amendment_id, row]));
  const docs: LoadedDoc[] = contracts.rows.map((row) => {
    let parsed: TermsDoc;
    try {
      parsed = parseTermsDoc(row.terms);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`contract ${row.id}: ${message}`);
    }
    const kind = asKind(row.kind, row.id);
    if (parsed.kind !== kind) {
      throw new Error(`contract ${row.id}: table kind ${kind} does not match terms meta ${parsed.kind}`);
    }
    const link = amendmentById.get(row.id) ?? null;
    return {
      ...parsed,
      contractId: row.id,
      artistId: row.artist_id,
      kind,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      supersedesContractId: link?.supersedes_contract_id ?? null,
      docPath: row.doc_path,
      sourcePath: row.source_path && row.source_path.length > 0 ? row.source_path : null,
      raw: row.terms,
    };
  });
  return {
    artists: artists.rows.map((row) => ({
      id: row.id,
      stageName: row.stage_name,
      legalName: row.legal_name,
      joinedAt: row.joined_at,
      country: row.country,
    })),
    docs,
  };
}
