import { describe, expect, it } from 'bun:test';

import { createPlantRun, PLANT_KINDS, type PlantKind } from './plantEngine';
import { plantFacts } from './plantFacts';

const facts = (kind: PlantKind, mutate: (run: ReturnType<typeof createPlantRun>) => void) => {
  const run = createPlantRun(kind);
  mutate(run);
  return plantFacts(kind, run.state);
};

describe('text equivalent of a plant state (LRN-037)', () => {
  it('names a distinct state for each situation of each plant, with the numbers the drawing shows', () => {
    expect(facts('motor-v1', () => {})).toEqual({ key: 'plant.motor.stopped', params: { speed: 0 } });
    expect(
      facts('motor-v1', (r) => {
        for (let i = 0; i < 3; i += 1) r.tick({ command: true });
      }),
    ).toEqual({ key: 'plant.motor.spinning', params: { speed: 300 } });
    expect(
      facts('motor-v1', (r) => {
        for (let i = 0; i < 10; i += 1) r.tick({ command: true });
      }).key,
    ).toBe('plant.motor.atSpeed');
    expect(facts('motor-v1', (r) => r.act('stall')).key).toBe('plant.motor.stalled');
    expect(facts('tank-v1', (r) => r.act('pumpFault')).key).toBe('plant.tank.pumpFault');
    expect(
      facts('tank-v1', (r) => {
        for (let i = 0; i < 70; i += 1) r.tick({ pump: false });
      }).key,
    ).toBe('plant.tank.low');
    expect(facts('tank-v1', (r) => r.tick({ pump: true })).key).toBe('plant.tank.filling');
    expect(facts('tank-v1', (r) => r.tick({ pump: false })).key).toBe('plant.tank.draining');
    expect(facts('conveyor-v1', (r) => r.act('jam')).key).toBe('plant.conveyor.jam');
    expect(
      facts('conveyor-v1', (r) => {
        for (let i = 0; i < 5; i += 1) r.tick({ belt: true });
      }).key,
    ).toBe('plant.conveyor.classifier');
    expect(facts('pedestrian-v1', (r) => r.act('request')).key).toBe('plant.crossing.waiting');
    expect(
      facts('pedestrian-v1', (r) => {
        r.act('request');
        r.act('blocked');
      }).key,
    ).toBe('plant.crossing.blocked');
  });

  it('keeps the key stable while only a number moves, so that an announcement is made on a change of situation, not on every scan', () => {
    const run = createPlantRun('tank-v1');
    run.tick({ pump: true });
    const first = plantFacts('tank-v1', run.state).key;
    run.tick({ pump: true });
    expect(plantFacts('tank-v1', run.state).key).toBe(first);
    expect(PLANT_KINDS.every((kind) => plantFacts(kind, createPlantRun(kind).state).key.startsWith('plant.'))).toBe(true);
  });
});
