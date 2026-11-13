import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import { catalogue } from '../core/catalogue';
import { createPlantCore } from '../core/plantCore';
import { parseScene, validateScene } from '../core/scene';

// Importing createPlantCore registers the shipped parts, the catalogue a learner's scene is validated against.
void createPlantCore;

const load = (dir: string): unknown => JSON.parse(readFileSync(resolve(import.meta.dir, '../../..', dir, 'scene.json'), 'utf8'));
const kindsOf = (scene: unknown) => (scene as { parts: { part: string }[] }).parts.map((p) => p.part);

describe('shipped scenes use the public format and catalogue', () => {
  it('SCN-001 the shipped scenes are listed in the order of the reference scene table, scene 1 first', () => {
    expect(SCENE_INDEX.map((e) => e.id)).toEqual([
      'belt-to-sensor',
      'latch-two-sensors',
      'timed-tank',
      'counted-queue',
      'two-axis-assembly',
      'two-axis-assembly-numeric',
      'buffer-release',
      'merge-lines',
      'lift-stacking',
      'tank-level-control',
      'layer-palletizer',
      'belt-to-belt-transfer',
      'three-axis-palletizing',
      'balanced-production-line',
      'colour-separation',
      'height-sorting-turntable',
      'height-sorting-chain',
      'weight-sorting',
      'vision-sorting',
    ]);
  });

  it('SCN-002 every shipped scene validates against the public scene format and uses only catalogue parts', () => {
    expect(SCENE_INDEX.length).toBeGreaterThan(0);
    const known = new Set(catalogue.list().map((d) => d.id));
    for (const entry of SCENE_INDEX) {
      const scene = load(entry.dir);
      expect(validateScene(scene, catalogue)).toEqual([]);
      expect(parseScene(JSON.stringify(scene))).not.toHaveProperty('problems');
      for (const kind of kindsOf(scene)) expect(known.has(kind)).toBe(true);
    }
  });

  it('SCN-002 the same check rejects a scene with a private part kind', () => {
    const scene = {
      schemaVersion: 1,
      name: 'x',
      cameras: [],
      parts: [{ id: 'a', part: 'private-gadget', name: 'A', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
    };
    expect(validateScene(scene, catalogue).length).toBeGreaterThan(0);
  });

  it('SCN-007 every shipped scene declares a positive shortestPulseMs', () => {
    for (const entry of SCENE_INDEX) {
      const pulse = (load(entry.dir) as { shortestPulseMs?: unknown }).shortestPulseMs;
      expect(typeof pulse).toBe('number');
      expect(pulse as number).toBeGreaterThan(0);
    }
  });

  it('SCN-007 a scene without the field, or with a non-positive one, is rejected by the validator', () => {
    const base = { schemaVersion: 1, name: 'x', cameras: [], parts: [] };
    expect(validateScene({ ...base, shortestPulseMs: 0 }, catalogue).length).toBeGreaterThan(0);
    expect(validateScene({ ...base, shortestPulseMs: 200 }, catalogue)).toEqual([]);
  });
});
