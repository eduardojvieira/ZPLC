import { describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCENE_INDEX } from '../../packages/zplc-ide/src/generated/sceneIndex';
import { outputsFor, pagesFor, readScenes } from './generate_scene_pages';
import { LANGS, staleOutputs } from './reference-lib';

const { scenes, problems } = readScenes();
const page = (id: string) => pagesFor(scenes).find((entry) => entry.path === `plant/scenes/${id}.md`)!;
const tableShape = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split(' | ').length);
const headings = (text: string) => [...text.matchAll(/^(#{2,6}) /gm)].map((m) => m[1]!.length);

describe('CRS-011 the pages of the shipped scenes are generated from the scene directories', () => {
  it('CRS-011 every scene has a page in English and in Spanish with the same table structure', () => {
    expect(problems).toEqual([]);
    expect(scenes.map((scene) => scene.id)).toEqual(SCENE_INDEX.map((entry) => entry.id));
    for (const { id } of SCENE_INDEX) {
      const en = page(id).body('en');
      const es = page(id).body('es');
      expect(tableShape(es)).toEqual(tableShape(en));
      expect(headings(es)).toEqual(headings(en));
    }
    expect(outputsFor(scenes)).toHaveLength((SCENE_INDEX.length + 1) * LANGS.length);
  });

  it('CRS-011 the page of a scene lists its signals from the plant map', () => {
    const body = page('belt-to-sensor').body('en');
    expect(body).toContain('| `StartButton.pressed` | sensor | BOOL | `BeltToSensor.Start` |');
    expect(body).toContain('| `Belt1.run` | command | BOOL | `BeltToSensor.Run` |');
    expect(body).toContain('(`shortestPulseMs`): 800 ms');
    expect(body).toContain('| Belt conveyor | 1 |');
    expect(page('belt-to-sensor').body('es')).toContain('| Cinta transportadora | 1 |');
  });

  it('CRS-011 the page names the lessons of the scene and the check lists what the scenario asserts', () => {
    const body = page('belt-to-sensor').body('en');
    expect(body).toContain('(../../learn/lessons/plant-belt-to-sensor.md)');
    expect(body).toContain('| at 100 ms | `BeltToSensor.Run = false` |');
    expect(body).toContain('| from 0 ms, within 8000 ms | `fact:count:EyeFar = true` |');
  });

  it('CRS-011 --check fails when a scene changes and its page does not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scene-pages-'));
    try {
      cpSync(new URL('../../packages/zplc-ide/plant-scenes/belt-to-sensor', import.meta.url).pathname, join(dir, 'belt-to-sensor'), {
        recursive: true,
      });
      const changed = readScenes(dir, ['belt-to-sensor']);
      writeFileSync(
        join(dir, 'belt-to-sensor', 'text.json'),
        JSON.stringify({
          en: { name: 'Belt', goal: 'Another goal.', teaches: 'x' },
          es: { name: 'Cinta', goal: 'Otra meta.', teaches: 'x' },
        }),
      );
      const edited = readScenes(dir, ['belt-to-sensor']);
      const stale = staleOutputs(outputsFor(edited.scenes));
      expect(changed.problems).toEqual([]);
      expect(stale.length).toBeGreaterThan(0);
      expect(stale.some((message) => message.includes('belt-to-sensor.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CRS-011 a scene without text.json is a located problem of the scene index', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scene-pages-'));
    try {
      const found = readScenes(dir, []);
      expect(found.problems).toEqual([]);
      cpSync(new URL('../../packages/zplc-ide/plant-scenes/belt-to-sensor', import.meta.url).pathname, join(dir, 'belt-to-sensor'), {
        recursive: true,
      });
      rmSync(join(dir, 'belt-to-sensor', 'text.json'));
      expect(readScenes(dir, ['belt-to-sensor']).problems).toEqual(['plant-scenes/belt-to-sensor: missing text.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CRS-013 a scene page states no frame rate, latency or board', () => {
    for (const out of outputsFor(scenes)) {
      expect(out.content).not.toMatch(/\b\d+(\.\d+)?\s*(fps|frames per second|cuadros por segundo)\b/i);
      expect(out.content).not.toMatch(/latenc(y|ia)\s*(of|de)\s*\d/i);
      expect(out.content).not.toMatch(/\b(stm32|esp32|nrf\d+|rp2040|frdm|nucleo)\b/i);
    }
  });

  it('CRS-011 the committed pages are in step with the scene files', () => {
    expect(staleOutputs(outputsFor(scenes))).toEqual([]);
  });
});
