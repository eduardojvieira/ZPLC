/**
 * Test inputs of the family tests: the part views the real plant core publishes for belt-to-sensor, and small queries on pieces.
 * Only the tests import this file.
 */
import { afterEach } from 'bun:test';
import type { PartView, PlantCore, PlantSceneFile } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import scene from '../../../../plant-scenes/belt-to-sensor/scene.json';
import { pieceExtent, type Piece } from './shared';

/** belt-to-sensor in a fresh plant core per test, disposed after each test of the file that calls this. */
export function beltToSensor(): { views(): Promise<Record<string, PartView>>; core(): PlantCore } {
  let core: PlantCore | undefined;
  afterEach(() => {
    core?.dispose();
    core = undefined;
  });
  return {
    async views() {
      core = await createPlantCore(scene as unknown as PlantSceneFile);
      return Object.fromEntries(core.snapshot().parts.map((p) => [p.id, p]));
    },
    core: () => core!,
  };
}

export const slot = (pieces: readonly Piece[], name: string) => pieces.find((p) => p.slot === name)!;
export const shown = (pieces: readonly Piece[], prefix: string) => pieces.filter((p) => p.slot.startsWith(prefix) && p.visible);
/** The lowest point of a piece in the part's frame. */
export const bottom = (p: Piece) => p.at[1] - pieceExtent(p)[1];
/** The highest point of a piece in the part's frame. */
export const top = (p: Piece) => p.at[1] + pieceExtent(p)[1];
