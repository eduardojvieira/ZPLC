import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { registerParts, catalogue } = await import('../core/catalogue');
const { itemParts } = await import('../core/parts/items');
const { conveyorParts } = await import('../core/parts/conveyors');
const { sourceParts } = await import('../core/parts/sources');
const { sensorParts } = await import('../core/parts/sensors');
const { flowParts } = await import('../core/parts/flow');
const { panelParts } = await import('../core/parts/panel');
const { PlantActivityView } = await import('./PlantActivityView');
const { EditorPanel } = await import('../editor/EditorPanel');
const { usePlantChoice } = await import('./usePlantChoice');
const { usePlantEdit } = await import('../editSession');
const { usePlantDocument } = await import('../../store/usePlantDocument');
const { parseScene } = await import('../core/scene');
const { SCENE_INDEX } = await import('../../generated/sceneIndex');

registerParts(
  [...itemParts, ...conveyorParts, ...sourceParts, ...sensorParts, ...flowParts, ...panelParts].filter((d) => !catalogue.get(d.id)),
);

const SCENES = join(import.meta.dir, '../../../plant-scenes');
const read = (id: string, file: string) => readFileSync(join(SCENES, id, file), 'utf8');
const parsed = parseScene(read('belt-to-sensor', 'scene.json'));
if ('problems' in parsed) throw new Error('fixture scene');
const scene = parsed.scene;
const map = JSON.parse(read('belt-to-sensor', 'plant-map.json'));

const showScene = (bound: boolean) => {
  usePlantDocument.setState({ open: true, active: true });
  usePlantChoice.getState().show({ panel: 'test', key: 'belt-to-sensor', scene, map: bound ? map : undefined });
};

afterEach(() => {
  usePlantEdit.getState().end();
  usePlantEdit.getState().setRunning(false);
  usePlantChoice.setState({ request: undefined, shown: undefined });
  usePlantDocument.setState({ open: false, active: false });
});

describe('the Plant activity (PLS-005, PLS-006, SCN-016)', () => {
  it('PLS-005 the catalogue is the Plant activity and adds a part by pointer and by keyboard', async () => {
    showScene(true);
    usePlantEdit.getState().begin({ scene, map }, 'belt-to-sensor');
    const { user } = dom.render(<PlantActivityView />);
    const count = () => usePlantEdit.getState().editor!.state().scene.parts.length;
    const before = count();
    await user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') }));
    expect(count()).toBe(before + 1);
    dom.screen.getByRole('button', { name: dom.t('plantEditor.add') }).focus();
    await user.keyboard('{Enter}');
    expect(count()).toBe(before + 2);
  });

  it('PLS-006 the signal list shows type, direction and binding state with a text equivalent', () => {
    showScene(false);
    const view = dom.render(<PlantActivityView />);
    const table = view.container.querySelector('[data-plant-signal-list]')!;
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0]!;
    expect(first.querySelectorAll('td')[0]!.textContent).toMatch(/BOOL|INT|REAL/);
    expect(['Command', 'Sensor']).toContain(first.querySelectorAll('td')[1]!.textContent!);
    expect(first.querySelectorAll('td')[2]!.textContent).toContain(dom.t('plantEditor.unbound'));
    view.unmount();
    showScene(true);
    const bound = dom.render(<PlantActivityView />);
    const point = Object.values(map.signals as Record<string, { point: string }>)[0]!.point;
    expect(bound.container.textContent).toContain(dom.t('plantEditor.bound', { point }));
  });

  it('PLS-005 PartList is mounted with the props it had in the plant document', () => {
    showScene(true);
    usePlantEdit.getState().begin({ scene, map }, 'belt-to-sensor');
    usePlantEdit.getState().setRunning(true, 'belt-to-sensor');
    const view = dom.render(<PlantActivityView />);
    // the same list, grouped by family, one row per part of the session's scene, and disabled while the plant runs
    expect(view.container.querySelectorAll('optgroup').length).toBeGreaterThan(1);
    expect(view.container.querySelectorAll('li[data-part]').length).toBe(scene.parts.length);
    expect((dom.screen.getByRole('button', { name: dom.t('plantEditor.add') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('SCN-016 the Plant activity offers the empty floor and every shipped scene', () => {
    showScene(true);
    const view = dom.render(<PlantActivityView />);
    const options = [...view.container.querySelectorAll('select option')].map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('empty');
    for (const s of SCENE_INDEX) expect(options).toContain(s.id);
  });

  it('PLS-005 a part that cannot be placed is said in the Plant activity, with the text the editor panel uses', async () => {
    showScene(true);
    usePlantEdit.getState().begin({ scene, map }, 'belt-to-sensor');
    const editor = usePlantEdit.getState().editor!;
    editor.place = () => ({ problem: 'parts[3].part: no such part' });
    const { user } = dom.render(<PlantActivityView />);
    const before = editor.state().scene.parts.length;
    await user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') }));
    expect(dom.screen.getByRole('alert').textContent).toContain('parts[3].part: no such part');
    expect(editor.state().scene.parts.length).toBe(before);
  });

  it('PLS-005 the two part lists shown while editing have unique ids and every reference resolves to one element', () => {
    showScene(true);
    usePlantEdit.getState().begin({ scene, map }, 'belt-to-sensor');
    const { editor, mapEditor } = usePlantEdit.getState();
    const view = dom.render(
      <>
        <PlantActivityView />
        <EditorPanel editor={editor!} mapEditor={mapEditor!} stopped catalogue={catalogue} />
      </>,
    );
    expect(view.container.querySelectorAll('section[aria-labelledby$="parts"]').length).toBe(2);
    const ids = [...view.container.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, n) => ids.indexOf(id) !== n)).toEqual([]);
    for (const el of view.container.querySelectorAll('[aria-labelledby],[aria-describedby]'))
      for (const name of ['aria-labelledby', 'aria-describedby'])
        for (const id of (el.getAttribute(name) ?? '').split(' ').filter(Boolean))
          expect(view.container.querySelectorAll(`[id="${CSS.escape(id)}"]`).length).toBe(1);
  });

  it('PLS-005 "Add a plant" runs the command that opens the plant document', async () => {
    const { bindCommands } = await import('../../commands/bus');
    const ran: string[] = [];
    const unbind = bindCommands({
      'view.plant': () => void ran.push('view.plant'),
      'view.showPlant': () => void ran.push('view.showPlant'),
    });
    try {
      const { user } = dom.render(<PlantActivityView />);
      await user.click(dom.screen.getByRole('button', { name: dom.t('plant.activity.add') }));
      expect(ran).toEqual(['view.plant']);
    } finally {
      unbind();
    }
  });

  it('PLS-005 the refusal note goes away when editing ends', async () => {
    showScene(true);
    usePlantEdit.getState().begin({ scene, map }, 'belt-to-sensor');
    usePlantEdit.getState().editor!.place = () => ({ problem: 'parts[3].part: no such part' });
    const { user } = dom.render(<PlantActivityView />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('plantEditor.add') }));
    expect(dom.screen.getByRole('alert')).toBeTruthy();
    await dom.act(async () => void usePlantEdit.getState().end());
    expect(dom.screen.queryByRole('alert')).toBeNull();
  });
});
