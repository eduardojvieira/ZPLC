import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await import('../core/plantCore'); // registers the shipped parts, as the application does
const { ProblemsPanel } = await import('../../components/ProblemsPanel');
const { usePlantEdit } = await import('../editSession');
const { usePlantMapProblems } = await import('./plantMapProblems');
const { parseScene } = await import('../core/scene');
const { useShellLayout } = await import('../../store/useShellLayout');

const parsed = parseScene(readFileSync(join(import.meta.dir, '../../../plant-scenes/belt-to-sensor/scene.json'), 'utf8'));
if ('problems' in parsed) throw new Error('fixture scene');
const session = usePlantEdit.getState;

afterEach(() => {
  session().end();
  usePlantMapProblems.setState({ problems: [], row: null });
});

const panel = () =>
  dom.render(
    createElement(ProblemsPanel, {
      summary: '',
      live: [],
      buildMessages: [],
      checked: true,
      fileTree: null,
      onActivate: () => undefined,
    }),
  );

describe('the problems of the plant in the Problems tab (SCN-015, PLS-005)', () => {
  it('SCN-015 a scene problem is an entry of Problems that selects its part', async () => {
    dom.act(() => session().begin({ scene: parsed.scene, map: null }, 'belt-to-sensor'));
    const editor = session().editor!;
    const first = parsed.scene.parts[0]!;
    let copy = '';
    dom.act(() => {
      copy = editor.duplicate(first.id);
      editor.configure(copy, { name: first.name }); // two parts with one name: the problem is at the second
      editor.select(null);
    });
    const { user } = panel();
    const section = dom.screen.getByRole('region', { name: dom.t('panel.problems.plant') });
    const entry = dom.within(section).getByRole('button', { name: new RegExp(editor.state().problems[0]!.message) });
    expect(entry.textContent).toContain(dom.t('panel.problems.plant')); // its source
    await user.click(entry);
    expect(editor.state().selection).toBe(copy); // the Inspector and the Plant activity read this selection
    expect(useShellLayout.getState().activityView).toBe('plant');
    // an unbound signal of the plant map is an entry of the same source, and opens its row
    dom.act(() => usePlantMapProblems.getState().publish([{ signal: 'Belt1.run', kind: 'unbound', message: 'Belt1.run is not bound' }]));
    await user.click(dom.within(section).getByRole('button', { name: /Belt1\.run is not bound/ }));
    expect(usePlantMapProblems.getState().row?.signal).toBe('Belt1.run');
  });
});
