import type { PartDefinition } from '../contracts';

/** The part registry (PRT-002, PRT-010): one definition per part, looked up by id. */
export interface Catalogue {
  get(id: string): PartDefinition | undefined;
  list(): readonly PartDefinition[];
}

export function createCatalogue(defs: readonly PartDefinition[]): Catalogue {
  const byId = new Map<string, PartDefinition>();
  for (const def of defs) {
    if (byId.has(def.id)) throw new Error(`duplicate part definition "${def.id}"`);
    byId.set(def.id, def);
  }
  const ordered = [...defs]; // registration order, never Map or Set order of anything else
  return { get: (id) => byId.get(id), list: () => ordered };
}

const DEFINITIONS: PartDefinition[] = [];
let shipped = createCatalogue(DEFINITIONS);

/** Registers part definitions into the shipped catalogue; rejects an id that is already there. */
export function registerParts(defs: readonly PartDefinition[]): void {
  shipped = createCatalogue([...DEFINITIONS, ...defs]);
  DEFINITIONS.push(...defs);
}

/** The shipped catalogue. Part files (P3, P4) register through `registerParts`. */
export const catalogue: Catalogue = {
  get: (id) => shipped.get(id),
  list: () => shipped.list(),
};
