import { describe, expect, it } from 'bun:test';
import type { PlantSceneFile } from '../contracts';
import raw from './fixtures/scene-v1-release.json';
import { catalogue } from './catalogue';
import './plantCore'; // registers the shipped parts
import { migrateScene, parseScene, SCENE_SCHEMA_VERSION, validateScene } from './scene';

const fixture = raw as unknown as PlantSceneFile;
const text = JSON.stringify(fixture);

describe('scene migration (SCN-006)', () => {
  it('SCN-006 a scene saved by the release (schema 1) opens unchanged and validates against the catalogue', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
    const opened = migrateScene(JSON.parse(text));
    expect('scene' in opened && opened.scene).toEqual(fixture);
    expect(parseScene(text)).toEqual({ scene: fixture });
    expect(validateScene(fixture, catalogue)).toEqual([]);
  });

  it('SCN-006 a scene of a newer schema fails with a located message that names its version', () => {
    const result = migrateScene({ ...fixture, schemaVersion: 2 });
    if (!('problems' in result)) throw new Error('a newer schema must not open');
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.path).toBe('schemaVersion');
    expect(result.problems[0]!.message).toContain('schemaVersion 2');
    expect(result.problems[0]!.message).toContain('newer');
    expect(result.problems[0]!.message).toContain('reads 1');
    expect(parseScene(JSON.stringify({ ...fixture, schemaVersion: 7 }))).toMatchObject({ problems: [{ path: 'schemaVersion' }] });
  });

  it('SCN-006 a missing, zero or non-integer version is refused at schemaVersion', () => {
    for (const bad of [0, 1.5, 'one', undefined]) {
      const result = migrateScene({ ...fixture, schemaVersion: bad });
      if (!('problems' in result)) throw new Error(`schemaVersion ${String(bad)} must not open`);
      expect(result.problems.map((p) => p.path)).toContain('schemaVersion');
    }
  });
});
