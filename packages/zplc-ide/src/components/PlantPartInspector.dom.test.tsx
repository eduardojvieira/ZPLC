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
const { PartForm } = await import('../plant/editor/PartForm');
const { catalogue } = await import('../plant/core/catalogue');

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

  it('PartForm keeps its default ids, and two forms mounted together have unique ids that every aria reference resolves to', () => {
    open();
    const alone = dom.render(
      <PartForm
        part={belt}
        def={catalogue.get(belt.part)}
        problems={[]}
        disabled={false}
        onMove={() => {}}
        onRotate={() => {}}
        onConfigure={() => {}}
      />,
    );
    expect(alone.container.querySelector('section')?.getAttribute('aria-labelledby')).toBe('plant-editor-form');
    expect(alone.container.querySelector('h3')?.id).toBe('plant-editor-form');
    alone.unmount();
    dom.render(
      <>
        <PlantPartInspector />
        <PartForm
          part={belt}
          def={catalogue.get(belt.part)}
          problems={[]}
          disabled={false}
          onMove={() => {}}
          onRotate={() => {}}
          onConfigure={() => {}}
        />
      </>,
    );
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
    for (const e of document.querySelectorAll('[aria-labelledby]'))
      for (const id of (e.getAttribute('aria-labelledby') ?? '').split(' '))
        expect(document.querySelectorAll(`[id="${id}"]`).length).toBe(1);
  });

  it('SCN-009 a refusal note is cleared when another part is selected and the first is selected again', async () => {
    open();
    const { user } = dom.render(<PlantPartInspector />);
    const field = dom.screen.getByLabelText('speedMps (m/s)');
    dom.act(() => field.focus());
    await user.keyboard('{Control>}a{/Control}99{Enter}');
    expect(dom.screen.getByRole('alert').textContent).toContain('limit');
    dom.act(() => edit().editor?.select('emitter'));
    dom.act(() => edit().editor?.select(belt.id));
    expect(dom.screen.queryByRole('alert')).toBeNull();
  });

  it('SHL-009 the read-only footer is shown only where nothing in the Inspector is editable', () => {
    open(false);
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByText(dom.t('inspector.readOnly'))).toBeTruthy();
    dom.act(() => edit().editor?.select(belt.id));
    expect(dom.screen.queryByText(dom.t('inspector.readOnly'))).toBeNull();
  });
});
