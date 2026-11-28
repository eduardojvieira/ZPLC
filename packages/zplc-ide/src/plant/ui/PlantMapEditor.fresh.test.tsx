/** The plant map shows the signals of the shipped parts although nothing opened the plant document first (it registers no parts itself). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { PlantMapEditor } = await import('./PlantMapEditor');
const { parseScene } = await import('../core/scene');

describe('the plant map before the plant document (PLS-006)', () => {
  it('lists the signals of the scene with the shipped parts and no problem of an unknown signal', () => {
    const parsed = parseScene(readFileSync(join(import.meta.dir, '../../../plant-scenes/belt-to-sensor/scene.json'), 'utf8'));
    if ('problems' in parsed) throw new Error('fixture scene');
    const view = dom.render(<PlantMapEditor scene={parsed.scene} ioMap={{ inputs: [], outputs: [] }} />);
    expect(view.container.querySelectorAll('tr[data-signal]').length).toBe(4);
    expect(view.container.textContent).not.toContain('is not a signal of this scene');
  });
});
