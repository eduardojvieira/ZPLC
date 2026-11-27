import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';
import type { PlantSceneFile } from '../plant/contracts';

const dom = await setupDom();
await stubProjectLoader();
await import('../plant/core/plantCore'); // registers the shipped parts, as the application does
const { usePlantEdit } = await import('../plant/editSession');
const { PlantPartInspector } = await import('./PlantPartInspector');
const { WorkbenchInspector } = await import('./WorkbenchInspector');

const scene = JSON.parse(readFileSync(join(import.meta.dir, '../../plant-scenes/belt-to-sensor/scene.json'), 'utf8')) as PlantSceneFile;
const belt = scene.parts.find((p) => p.part === 'belt');
if (!belt) throw new Error('the scene has no belt');
const edit = usePlantEdit.getState;

afterEach(() => {
  edit().setRunning(false);
  edit().end();
});

const open = (select = true) => {
  dom.act(() => edit().begin({ scene, map: null }, 'belt-to-sensor'));
  if (select) dom.act(() => edit().editor?.select(belt.id));
};

describe('the part form in the Inspector (PLS-005, SCN-008, SCN-009)', () => {
  it('PLS-005 selecting a part shows its form in the Inspector', () => {
    open(false);
    dom.render(<PlantPartInspector />);
    expect(dom.screen.queryByLabelText(dom.t('plantEditor.name'))).toBeNull();
    dom.act(() => edit().editor?.select(belt.id));
    expect((dom.screen.getByLabelText(dom.t('plantEditor.name')) as HTMLInputElement).value).toBe(belt.name);
  });

  it('SCN-009 a value outside its documented range is refused at its field and the scene is unchanged', async () => {
    open();
    const { user } = dom.render(<PlantPartInspector />);
    const before = JSON.stringify(edit().editor?.toFile());
    const field = dom.screen.getByLabelText('speedMps (m/s)');
    dom.act(() => field.focus());
    await user.keyboard('{Control>}a{/Control}99{Enter}');
    expect(dom.screen.getByRole('alert').textContent).toContain('limit');
    expect(JSON.stringify(edit().editor?.toFile())).toBe(before);
  });

  it('SCN-008 the form is disabled while the plant runs and says why', () => {
    open();
    dom.act(() => edit().setRunning(true));
    dom.render(<PlantPartInspector />);
    expect((dom.screen.getByLabelText(dom.t('plantEditor.name')) as HTMLInputElement).disabled).toBe(true);
    expect(dom.screen.getByRole('status').textContent).toBe(dom.t('plantEditor.running'));
  });

  it('SHL-009 the Inspector keeps its other selections', () => {
    edit().begin({ scene, map: null }, 'belt-to-sensor');
    edit().end();
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByText(dom.t('inspector.noElement'))).toBeTruthy();
    expect(dom.screen.queryByLabelText(dom.t('plantEditor.name'))).toBeNull();
  });
});
