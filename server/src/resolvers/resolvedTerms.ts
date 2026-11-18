import { GraphQLError } from "graphql";

import type { World } from "../load.js";
import { assertIsoDate, resolveArtistTerms, type ResolvedTerms } from "../terms.js";

export function resolvedTerms(world: World, artistId: number, asOf: string): ResolvedTerms {
  try {
    assertIsoDate(asOf, "asOf");
  } catch (err) {
    throw new GraphQLError(err instanceof Error ? err.message : String(err));
  }
  if (!world.artists.some((artist) => artist.id === artistId)) {
    throw new GraphQLError(`No artist ${artistId} in label.artists.`);
  }
  try {
    return resolveArtistTerms(world.docs, artistId, asOf);
  } catch (err) {
    throw new GraphQLError(err instanceof Error ? err.message : String(err));
  }
}
