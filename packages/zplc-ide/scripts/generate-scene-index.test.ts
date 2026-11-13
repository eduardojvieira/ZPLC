import { describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from './generate-scene-index';

const FILES = ['scene.json', 'plant-map.json', 'reference.st', 'starter.st', 'scenario.json'];
function sceneDir(text?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'scene-index-'));
  const dir = join(root, 'belt-to-sensor');
  mkdirSync(dir);
  for (const file of FILES) writeFileSync(join(dir, file), file === 'scene.json' ? '{"name":"Belt to sensor"}' : '');
  if (text !== undefined) writeFileSync(join(dir, 'text.json'), text);
  return root;
}

describe('SCN-001 the scene index takes the names of both languages from text.json', () => {
  it('SCN-001 the scene index carries a Spanish name different from the English one', () => {
    const { problems, source } = generate(
      sceneDir(JSON.stringify({ en: { name: 'Belt to sensor' }, es: { name: 'Cinta hasta un sensor' } })),
    );
    expect(problems).toEqual([]);
    expect(source).toContain('"es": "Cinta hasta un sensor"');
    expect(source).toContain('"en": "Belt to sensor"');
  });

  it('CRS-011 a scene without text.json is a located problem of the scene index', () => {
    const { problems } = generate(sceneDir());
    expect(problems).toEqual(['plant-scenes/belt-to-sensor: missing text.json']);
  });

  it('CRS-011 a text.json without a Spanish name is a located problem', () => {
    const { problems } = generate(sceneDir(JSON.stringify({ en: { name: 'x' } })));
    expect(problems).toEqual(['plant-scenes/belt-to-sensor/text.json: needs a name in en and es']);
  });
});
