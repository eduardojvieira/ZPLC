import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { createPlantCore } = await import('../core/plantCore');
const { catalogue } = await import('../core/catalogue');
const { plantViewEn, plantViewEs } = await import('../../i18n/catalog/plantView');
import type { PlantCore, PlantSceneFile, ScenePart } from '../contracts';

// The REAL M5 parts through the REAL core: OperatePanel.stations.test.tsx uses stand-in views.
const at = (id: string, name: string, x: number, config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position: [x, 0, 0],
  rotationYDeg: 0,
  config,
});
const PARTS: ScenePart[] = [
  at('lift', 'Lift1', 0),
  at('stacker-crane', 'Crane1', 6),
  at('machining-centre', 'Mc1', 14),
  at('limit-switch', 'Lim1', 18),
  at('aligner', 'Align1', 22),
  at('chute', 'Chute1', 26),
  at('crate', 'Crate1', 30),
  at('stack-light', 'Stack1', 34),
];
const scene: PlantSceneFile = { schemaVersion: 1, name: 'M5 readouts', parts: PARTS, cameras: [] };
const STATIONS = ['Lift1', 'Crane1', 'Mc1'];

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
async function render(drive?: (core: PlantCore) => void) {
  const core = await createPlantCore(scene);
  cores.push(core);
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 10) core.advance(10);
  };
  run(300);
  if (drive) {
    drive(core);
    run(1500);
  }
  const { container } = dom.render(<OperatePanel scene={scene} core={core} snapshot={core.snapshot()} onChange={() => undefined} />);
  const text = (selector: string) => container.querySelector(selector)?.textContent;
  return { container, core, text };
}

describe('OperatePanel readouts of the real M5 parts', () => {
  it('VIS-008 the lift, the crane and the machining centre have a station readout, and none is a stack light or null', async () => {
    const { container } = await render();
    for (const name of STATIONS) expect(container.querySelector(`[data-plant-station="${name}"]`)).not.toBeNull();
    expect([...container.querySelectorAll('[data-plant-stack]')].map((e) => (e as HTMLElement).dataset.plantStack)).toEqual(['Stack1']);
    // The station readouts are the only ones of M5: no diverter, manipulator or reading branch swallows a station.
    for (const name of STATIONS) {
      for (const other of ['diverter', 'manipulator', 'reading', 'tank', 'display'])
        expect(container.querySelector(`[data-plant-${other}="${name}"]`)).toBeNull();
    }
  });

  it('VIS-008 each station reads its own text from the real snapshot, in the right sentence', async () => {
    const home = await render();
    expect(home.text('[data-plant-station="Lift1"]')).toBe('Lift Lift1: level 1');
    expect(home.text('[data-plant-station="Crane1"]')).toBe('Stacker crane Crane1: bay 0, level 0, fork centre');
    expect(home.text('[data-plant-station="Mc1"]')).toBe('Machining centre Mc1: idle');
    const moved = await render((core) => core.apply({ 'Lift1.up': true, 'Crane1.forkRight': true }));
    expect(moved.text('[data-plant-station="Lift1"]')).toBe('Lift Lift1: travelling');
    expect(moved.text('[data-plant-station="Crane1"]')).toMatch(/^Stacker crane Crane1: bay 0, level 0, fork (centre|right)$/);
  });

  it('PLT-011 each real part lists its own fault actions with the plant.fault label, and choosing does not trigger one', async () => {
    const { container, core } = await render();
    const log: string[] = [];
    const act = core.act.bind(core);
    core.act = (name, action) => (log.push(`${name} ${action}`), act(name, action));
    const actions = (name: string) => [...container.querySelector<HTMLSelectElement>(`[data-plant-fault="${name}"]`)!.options].slice(1);
    let listed = 0;
    for (const p of PARTS) {
      const real = catalogue.get(p.part)!.actions;
      if (real.length === 0) continue;
      listed += 1;
      const options = actions(p.name);
      expect(options.map((o) => o.value)).toEqual([...real]);
      expect(options.map((o) => o.textContent)).toEqual(real.map((a) => plantViewEn[`plant.fault.${a}` as keyof typeof plantViewEn]));
      for (const a of real) {
        expect(plantViewEn[`plant.fault.${a}` as keyof typeof plantViewEn]).toBeTruthy(); // a part without a label fails here
        expect(plantViewEs[`plant.fault.${a}` as keyof typeof plantViewEs]).toBeTruthy();
      }
    }
    expect(listed).toBeGreaterThanOrEqual(4); // the lift, the crane, the machining centre and the limit switch at least
    expect(actions('Lift1').map((o) => o.value)).toEqual(['stuck', 'stall', 'levelStuckOff']);
    expect(actions('Crane1').map((o) => o.value)).toEqual(['stuckX', 'stuckY', 'forkStuck', 'loadedStuckOff', 'beltStall']);
    const select = container.querySelector<HTMLSelectElement>('[data-plant-fault="Crane1"]')!;
    dom.fireEvent.change(select, { target: { value: 'forkStuck' } });
    expect(log).toEqual([]);
    dom.fireEvent.click(container.querySelector('[data-plant-fault-trigger="Crane1"]')!);
    expect(log).toEqual(['Crane1 forkStuck']);
  });
});
