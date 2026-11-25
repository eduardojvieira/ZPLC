/** Operator controls that stand together share one station (plan-vis C4): single-linkage over the planar distance. */
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartView, PlantSceneFile } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { controlStation, groupControls, STATION_REACH_M } from './controlStations';

const SCENES = join(import.meta.dir, '../../../plant-scenes');
const part = (id: string, kind: string, x: number, z: number, y = 1): PartView =>
  ({ id, part: kind, name: id, pose: { p: [x, y, z], yaw: 0 }, state: {}, signals: {} }) as unknown as PartView;
const button = (id: string, x: number, z = 0) => part(id, 'push-button', x, z);

describe('control stations (plan-vis C4)', () => {
  it('two buttons 0.4 m apart are one station with both members and the widened footprint', () => {
    const parts = [button('b', 0.4), button('a', 0)];
    const s = controlStation(parts[1]!, parts)!;
    expect(s.id).toBe('a');
    expect(s.members).toEqual(['a', 'b']);
    expect(s.min).toEqual([-0.08, -0.08]);
    expect(s.max[0]).toBeCloseTo(0.48, 9);
    expect(s.max[1]).toBeCloseTo(0.08, 9);
    expect(s.floor).toBe(0);
    expect(s.top).toBeCloseTo(1 - 0.14, 9);
    expect(controlStation(parts[0]!, parts)).toEqual(s);
    expect(STATION_REACH_M).toBe(0.6);
  });

  it('a button 1.0 m from another is alone', () => {
    const parts = [button('a', 0), button('b', 1)];
    expect(controlStation(parts[0]!, parts)).toBeNull();
    expect(groupControls(parts).size).toBe(0);
  });

  it('a chain of 0.5 m links is one station', () => {
    const parts = [button('a', 0), part('b', 'selector-switch', 0.5, 0), button('c', 1)];
    expect(groupControls(parts).get('c')!.members).toEqual(['a', 'b', 'c']);
  });

  it('a belt or a sensor next to a button is ignored', () => {
    const parts = [button('a', 0), part('belt', 'belt', 0.2, 0), part('eye', 'sensor', 0.1, 0.1)];
    expect(groupControls(parts).size).toBe(0);
  });

  it('the result does not depend on the input order', () => {
    const parts = [button('a', 0), button('b', 0.5), button('c', 3), button('d', 3.4)];
    expect(groupControls([...parts].reverse())).toEqual(groupControls(parts));
  });

  it('the 21 reference scenes: which get stations, with which members', async () => {
    const found: Record<string, string[][]> = {};
    for (const id of readdirSync(SCENES).sort()) {
      const scene = JSON.parse(readFileSync(join(SCENES, id, 'scene.json'), 'utf8')) as PlantSceneFile;
      const core = await createPlantCore(scene);
      try {
        const stations = new Set(groupControls(core.snapshot().parts).values());
        if (stations.size) found[id] = [...stations].map((s) => [...s.members]);
      } finally {
        core.dispose();
      }
    }
    // The emergency stop and the indicator light (C4) join the push buttons and selectors they stand beside.
    expect(found).toEqual({
      'buffer-release': [['done', 'fault']],
      'stacker-crane-warehouse': [['req1', 'req2', 'req3']],
      'three-level-lifts': [['estop', 'start']],
      'timed-tank': [['estop', 'start']],
    });
  });
});
