import { buildContractField, type ArtistField } from "../field.js";
import type { World } from "../load.js";

export function contractField(world: World): ArtistField[] {
  return buildContractField(world.artists, world.docs);
}
