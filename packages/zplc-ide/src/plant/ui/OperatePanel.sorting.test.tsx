import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { registerParts, catalogue } = await import('../core/catalogue');
const { plantViewEn, plantViewEs } = await import('../../i18n/catalog/plantView');
import type { PartDefinition, PartView, PlantCore, PlantSceneFile, PlantSnapshot, ScenePart } from '../contracts';

// The real parts register when the plant core is imported, so it is imported first: a stand-in is registered only for a part the core
// does not define, and a stand-in never takes the place of a real part for another test file of the same process.
await import('../core/plantCore');
const STANDINS: Record<string, [PartDefinition['family'], readonly string[]]> = {
  'light-array': ['sensors', ['readingStuck', 'readingOffset']],
  scale: ['sensors', ['readingStuck', 'readingOffset']],
  'vision-sensor': ['sensors', ['blind', 'misread']],
  pusher: ['flow', ['stuck']],
  'diverter-arm': ['flow', ['stuck']],
  'chain-transfer': ['conveyors', ['stall', 'liftStuck', 'jam']],
  turntable: ['conveyors', ['stall', 'turnStuck', 'jam']],
};
registerParts(
  Object.entries(STANDINS)
    .filter(([id]) => !catalogue.get(id))
    .map(([id, [family, actions]]) => ({
      id,
      family,
      names: { en: id, es: id },
      config: {},
      signals: () => [],
      actions,
      snapPoints: () => [],
      doc: { en: '', es: '' },
    })),
);

const part = (id: string, kind: string, name: string): ScenePart => ({
  id,
  part: kind,
  name,
  position: [0, 0, 0],
  rotationYDeg: 0,
  config: {},
});
const view = (p: ScenePart, state: PartView['state']): PartView => ({
  id: p.id,
  part: p.part,
  name: p.name,
  pose: { id: p.id, part: p.part, kind: 'box', size: [0.1, 0.1, 0.1], p: [0, 0, 0], q: [0, 0, 0, 1] },
  state,
  signals: {},
});
const scale = part('s', 'scale', 'Scale1');
const array = part('l', 'light-array', 'Array1');
const vision = part('v', 'vision-sensor', 'Vision1');
const pusher = part('p', 'pusher', 'Pusher1');
const arm = part('a', 'diverter-arm', 'Arm1');
const chain = part('c', 'chain-transfer', 'Chain1');
const turn = part('t', 'turntable', 'Turn1');
const stack = part('k', 'stack-light', 'Stack1');
const parts = [scale, array, vision, pusher, arm, chain, turn, stack];
const scene: PlantSceneFile = { schemaVersion: 1, name: 'Sort', parts, cameras: [] };
const snapshot: PlantSnapshot = {
  timeMs: 0,
  scans: 0,
  parts: [
    view(scale, { text: '3.50 kg, stable', fraction: 0.17 }),
    view(array, { text: '0.30 m', fraction: 0.5 }),
    view(vision, { text: 'code 2', fraction: 0.2 }),
    view(pusher, { text: 'extended', fraction: 1 }),
    view(arm, { text: 'retracted', fraction: 0 }),
    view(chain, { text: 'raised', fraction: 1 }),
    view(turn, { text: 'centre', fraction: 0 }),
    view(stack, { red: false, amber: true, green: false }),
  ],
  items: [],
  facts: {},
};
const render = () => {
  const core = { operate: () => undefined, act: () => undefined, addItem: () => 'x', removeItem: () => undefined } as unknown as PlantCore;
  return dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot} onChange={() => undefined} />);
};

describe('OperatePanel sorting parts', () => {
  it(
    'VIS-010 a numeric sensor and a diverter appear in the fault list with their actions, choosing does not trigger, and are not drawn ' +
      'as a stack light',
    () => {
      const log: string[] = [];
      const core = { operate: () => undefined, act: (n: string, a: string) => void log.push(`${n} ${a}`) } as unknown as PlantCore;
      const { container } = dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot} onChange={() => undefined} />);
      for (const p of parts.slice(0, 7)) {
        const select = container.querySelector<HTMLSelectElement>(`[data-plant-fault="${p.name}"]`)!;
        expect([...select.options].map((o) => o.value)).toEqual(['', ...catalogue.get(p.part)!.actions]);
      }
      const select = container.querySelector<HTMLSelectElement>('[data-plant-fault="Scale1"]')!;
      dom.fireEvent.change(select, { target: { value: 'readingStuck' } });
      expect(log).toEqual([]);
      dom.fireEvent.click(container.querySelector('[data-plant-fault-trigger="Scale1"]')!);
      expect(log).toEqual(['Scale1 readingStuck']);
      expect([...container.querySelectorAll('[data-plant-stack]')].map((e) => (e as HTMLElement).dataset.plantStack)).toEqual(['Stack1']);
    },
  );

  it('VIS-008 a numeric sensor reads as its text and a diverter as its text with a marker other than colour', () => {
    const { container } = render();
    const text = (sel: string) => container.querySelector(sel)!.textContent;
    expect(text('[data-plant-reading="Scale1"]')).toBe('Scale1: 3.50 kg, stable');
    expect(text('[data-plant-reading="Array1"]')).toBe('Array1: 0.30 m');
    expect(text('[data-plant-reading="Vision1"]')).toBe('Vision1: code 2');
    expect(text('[data-plant-diverter="Pusher1"]')).toBe('▲ Pusher1: extended');
    expect(text('[data-plant-diverter="Arm1"]')).toBe('○ Arm1: retracted');
    expect(text('[data-plant-diverter="Chain1"]')).toBe('▲ Chain1: raised');
    expect(text('[data-plant-diverter="Turn1"]')).toBe('○ Turn1: centre');
  });

  it('PLT-011 every action of every M4 part has a plant.fault label in both catalogues', () => {
    for (const id of Object.keys(STANDINS))
      for (const action of catalogue.get(id)!.actions) {
        expect(Object.keys(plantViewEn)).toContain(`plant.fault.${action}`);
        expect(Object.keys(plantViewEs)).toContain(`plant.fault.${action}`);
      }
  });

  it('VIS-008 the tank, stack light, manipulator and support readouts are unchanged', () => {
    const { container } = render();
    expect(container.querySelector('[data-plant-stack]')!.textContent).toContain('Amber');
    expect(container.querySelector('[data-plant-tank]')).toBeNull();
  });
});
