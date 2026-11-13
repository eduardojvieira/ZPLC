import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { createPlantCore } = await import('../core/plantCore');
const { catalogue } = await import('../core/catalogue');
const { plantViewEn, plantViewEs } = await import('../../i18n/catalog/plantView');
import type { PlantCore, PlantSceneFile, ScenePart } from '../contracts';

// The REAL parts through the REAL core: OperatePanel.sorting.test.tsx uses stand-in parts that the real ones shadow.
const at = (id: string, name: string, x: number, config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position: [x, 0, 0],
  rotationYDeg: 0,
  config,
});
const PARTS: ScenePart[] = [
  at('scale', 'Scale1', 0),
  at('workpiece', 'Work1', 0, { code: 3 }),
  at('light-array', 'Array1', 4),
  at('box', 'Box1', 4, { height: '0.3' }),
  at('vision-sensor', 'Vision1', 8),
  at('workpiece', 'Work2', 8, { code: 2 }),
  at('pusher', 'Pusher1', 12),
  at('diverter-arm', 'Arm1', 16),
  at('chain-transfer', 'Chain1', 20),
  at('turntable', 'Turn1', 24),
  at('stack-light', 'Stack1', 28),
];
const scene: PlantSceneFile = { schemaVersion: 1, name: 'M4 readouts', parts: PARTS, cameras: [] };
const NUMERIC = ['Scale1', 'Array1', 'Vision1'];
const DIVERTERS = ['Pusher1', 'Arm1', 'Chain1', 'Turn1'];

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
  run(800);
  if (drive) {
    drive(core);
    run(2500);
  }
  const { container } = dom.render(<OperatePanel scene={scene} core={core} snapshot={core.snapshot()} onChange={() => undefined} />);
  const text = (selector: string) => container.querySelector(selector)?.textContent;
  return { container, core, text };
}

describe('OperatePanel readouts of the real M4 parts', () => {
  it('VIS-008 every numeric sensor and every diverter has a readout, none is a stack light, none is null', async () => {
    const { container } = await render();
    for (const name of NUMERIC) expect(container.querySelector(`[data-plant-reading="${name}"]`)).not.toBeNull();
    for (const name of DIVERTERS) expect(container.querySelector(`[data-plant-diverter="${name}"]`)).not.toBeNull();
    expect([...container.querySelectorAll('[data-plant-stack]')].map((e) => (e as HTMLElement).dataset.plantStack)).toEqual(['Stack1']);
  });

  it('VIS-008 the numeric sensors read as the weight at rest, the height class and the code of what they see', async () => {
    const { text } = await render();
    expect(text('[data-plant-reading="Scale1"]')).toBe('Scale1: 0.50 kg, stable');
    expect(text('[data-plant-reading="Array1"]')).toBe('Array1: 0.30 m');
    expect(text('[data-plant-reading="Vision1"]')).toBe('Vision1: code 2');
  });

  it('VIS-008 the diverters at home are told with the home marker and their home text, and moved with the other marker', async () => {
    const home = await render();
    expect(home.text('[data-plant-diverter="Pusher1"]')).toBe('○ Pusher1: retracted');
    expect(home.text('[data-plant-diverter="Arm1"]')).toBe('○ Arm1: home');
    expect(home.text('[data-plant-diverter="Chain1"]')).toBe('○ Chain1: lowered');
    expect(home.text('[data-plant-diverter="Turn1"]')).toBe('○ Turn1: centre');
    const moved = await render((core) =>
      core.apply({ 'Pusher1.extend': true, 'Arm1.divert': true, 'Chain1.lift': true, 'Turn1.toRight': true }),
    );
    expect(moved.text('[data-plant-diverter="Pusher1"]')).toBe('▲ Pusher1: extended');
    expect(moved.text('[data-plant-diverter="Arm1"]')).toBe('▲ Arm1: diverted');
    expect(moved.text('[data-plant-diverter="Chain1"]')).toBe('▲ Chain1: raised');
    expect(moved.text('[data-plant-diverter="Turn1"]')).toBe('▲ Turn1: right');
  });

  it('PLT-011 each real part lists its own fault actions with the plant.fault label, and choosing does not trigger one', async () => {
    const { container, core } = await render();
    const log: string[] = [];
    const act = core.act.bind(core);
    core.act = (name, action) => (log.push(`${name} ${action}`), act(name, action));
    const actions = (name: string) => [...container.querySelector<HTMLSelectElement>(`[data-plant-fault="${name}"]`)!.options].slice(1);
    for (const p of PARTS.filter((q) => (catalogue.get(q.part)?.actions.length ?? 0) > 0)) {
      const real = catalogue.get(p.part)!.actions;
      const options = actions(p.name);
      expect(options.map((o) => o.value)).toEqual([...real]);
      expect(options.map((o) => o.textContent)).toEqual(real.map((a) => plantViewEn[`plant.fault.${a}` as keyof typeof plantViewEn]));
      for (const a of real) {
        expect(plantViewEn[`plant.fault.${a}` as keyof typeof plantViewEs]).toBeTruthy();
        expect(plantViewEs[`plant.fault.${a}` as keyof typeof plantViewEs]).toBeTruthy();
      }
    }
    expect(
      actions('Scale1')
        .map((o) => o.value)
        .sort(),
    ).toEqual(['readingStuck', 'readingOffset'].sort());
    expect(
      actions('Vision1')
        .map((o) => o.value)
        .sort(),
    ).toEqual(['blind', 'misread'].sort());
    expect(
      actions('Chain1')
        .map((o) => o.value)
        .sort(),
    ).toEqual(['stall', 'liftStuck', 'jam'].sort());
    expect(
      actions('Turn1')
        .map((o) => o.value)
        .sort(),
    ).toEqual(['stall', 'turnStuck', 'jam'].sort());
    const select = container.querySelector<HTMLSelectElement>('[data-plant-fault="Vision1"]')!;
    dom.fireEvent.change(select, { target: { value: 'blind' } });
    expect(log).toEqual([]);
    dom.fireEvent.click(container.querySelector('[data-plant-fault-trigger="Vision1"]')!);
    expect(log).toEqual(['Vision1 blind']);
  });
});
