import type { LoadedDoc, World } from "../load.js";

export function contractById(world: World, id: number): LoadedDoc | null {
  return world.docs.find((doc) => doc.contractId === id) ?? null;
}
