/**
 * The state of a plant as a sentence key plus numbers (LRN-037). The drawing's label, the readout beside it and the
 * announcement all say the same thing from here; the key changes with the situation (stalled, jammed, low), not with every
 * scan, which is when `announce()` is called. Pure TypeScript.
 */
import type { PlantKind, PlantState } from './plantEngine';

export interface PlantFact { key: PlantFactKey; params: Record<string, number> }
export type PlantFactKey =
  | 'plant.motor.stalled' | 'plant.motor.atSpeed' | 'plant.motor.spinning' | 'plant.motor.stopped'
  | 'plant.conveyor.jam' | 'plant.conveyor.classifier' | 'plant.conveyor.diverter' | 'plant.conveyor.moving' | 'plant.conveyor.idle'
  | 'plant.tank.pumpFault' | 'plant.tank.high' | 'plant.tank.low' | 'plant.tank.filling' | 'plant.tank.draining'
  | 'plant.crossing.approaching' | 'plant.crossing.waiting' | 'plant.crossing.blocked' | 'plant.crossing.crossing' | 'plant.crossing.cleared';

/** What the plant did in its last scan, which only the tank needs to tell filling from draining. */
export function plantFacts(kind: PlantKind, state: PlantState): PlantFact {
  switch (kind) {
    case 'motor-v1': {
      const speed = state.speed as number;
      const key = state.stall ? 'plant.motor.stalled' : speed >= 900 ? 'plant.motor.atSpeed' : speed > 0 ? 'plant.motor.spinning' : 'plant.motor.stopped';
      return { key, params: { speed } };
    }
    case 'conveyor-v1': {
      const position = state.position as number;
      const count = state.classified as number;
      const key = state.jam ? 'plant.conveyor.jam' : position >= 200 && position < 300 ? 'plant.conveyor.classifier'
        : position >= 700 && position < 800 ? 'plant.conveyor.diverter' : state.moving ? 'plant.conveyor.moving' : 'plant.conveyor.idle';
      return { key, params: { position, count } };
    }
    case 'tank-v1': {
      const level = state.level as number;
      const key = state.pumpFault ? 'plant.tank.pumpFault' : level >= 800 ? 'plant.tank.high' : level <= 200 ? 'plant.tank.low' : state.filling ? 'plant.tank.filling' : 'plant.tank.draining';
      return { key, params: { level } };
    }
    case 'pedestrian-v1': {
      const phase = state.phase as string;
      const key = phase === 'waiting' && state.blocked ? 'plant.crossing.blocked' : (`plant.crossing.${phase}` as PlantFactKey);
      return { key, params: {} };
    }
  }
}
