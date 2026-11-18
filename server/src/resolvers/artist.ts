import type { ArtistRow, LoadedDoc, World } from "../load.js";

export function artistById(world: World, id: number): ArtistRow | null {
  return world.artists.find((artist) => artist.id === id) ?? null;
}

export function allArtists(world: World): ArtistRow[] {
  return world.artists.slice().sort((a, b) => a.id - b.id);
}

export function contractsForArtist(world: World, artistId: number): LoadedDoc[] {
  return world.docs
    .filter((doc) => doc.artistId === artistId)
    .slice()
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.contractId - b.contractId);
}
