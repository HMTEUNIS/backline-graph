import type { ArtistField } from "./types";

const QUERY = `query ContractField {
  contractField {
    artist { id stageName legalName joinedAt country }
    nodes {
      contractId
      effectiveFrom
      effectiveTo
      kind
      resolvedRate
      docPath
      sourcePath
      rawTerms
      rates { revenueType territory rate }
    }
    edges {
      fromContractId
      toContractId
      effectiveFrom
      replacedSections
      rateDelta
    }
  }
}`;

export async function loadContractField(): Promise<ArtistField[]> {
  const url = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    });
  } catch {
    throw new Error(`GraphQL at ${url} is not reachable. Start it with npm run dev in backline-graph/server.`);
  }
  if (!response.ok) {
    throw new Error(`GraphQL responded ${response.status}.`);
  }
  const body = (await response.json()) as {
    data?: { contractField: ArtistField[] };
    errors?: { message: string }[];
  };
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map((error) => error.message).join("\n"));
  }
  if (!body.data) throw new Error("GraphQL returned no data.");
  return body.data.contractField;
}
