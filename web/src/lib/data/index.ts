/**
 * Data seam. Every page reads through here, so replacing the sample world with
 * the GraphQL indexer later means changing this file (and the query documents),
 * not the screens.
 */
import { buildSampleWorld } from "./sample";
import type { World } from "./types";

export type { World } from "./types";

export async function getWorld(): Promise<World> {
  // INTEGRATION SEAM: replace with indexer queries (Hasura/Envio GraphQL).
  return buildSampleWorld(Date.now());
}

export function findCreatorByHandle(world: World, handle: string) {
  return world.creator.handleKey === handle.toLowerCase() ? world.creator : null;
}
