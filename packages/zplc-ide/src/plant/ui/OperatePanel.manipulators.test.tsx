import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { registerParts, catalogue } = await import('../core/catalogue');
const { panelParts } = await import('../core/parts/panel');
import type { PartDefinition, PartView, PlantCore, PlantSceneFile, PlantSnapshot, ScenePart } from '../contracts';

registerParts(panelParts.filter((d) => !catalogue.get(d.id)));
// The manipulator parts land in K6; a stub with the same id and fault actions stands in until K8 registers them.
if (!catalogue.get('gantry'))
  registerParts([
    {
      id: 'gantry',
      family: 'manipulators',
      names: { en: 'Gantry', es: 'Pórtico' },
      config: {},
      signals: () => [],
      actions: ['stuckX', 'gripFail'],
      snapPoints: () => [],
      doc: { en: '', es: '' },
    } satisfies PartDefinition,
  ]);

const part = (id: string, kind: string, name: string): ScenePart => ({
  id,
  part: kind,
  name,
  position: [0, 0, 0],
  rotationYDeg: 0,
  config: {},
});
const view = (p: ScenePart, state: PartView['state'], signals: PartView['signals'] = {}): PartView => ({
  id: p.id,
  part: p.part,
  name: p.name,
  pose: { id: p.id, part: p.part, kind: 'box', size: [0.1, 0.1, 0.1], p: [0, 0, 0], q: [0, 0, 0, 1] },
  state,
  signals,
});
const gantry = part('g', 'gantry', 'Gantry1');
const stack = part('k', 'stack-light', 'Stack1');
const tank = part('t', 'tank', 'Tank1');
const scene: PlantSceneFile = { schemaVersion: 1, name: 'Cell', parts: [gantry, stack, tank], cameras: [] };
const snapshot = (holding: boolean): PlantSnapshot => ({
  timeMs: 0,
  scans: 0,
  parts: [
    view(gantry, { text: 'X 0.52 m, Y 0.20 m', holding }, { gripped: holding }),
    view(stack, { red: false, amber: true, green: false }, { red: false, amber: true, green: false }),
    view(tank, { level: 0.4, heightM: 1, fraction: 0.4, spilling: false }, { level: 0.4 }),
  ],
  items: [],
  facts: {},
});
const render = (holding = true) => {
  const core = { operate: () => undefined, act: () => undefined, addItem: () => 'x', removeItem: () => undefined } as unknown as PlantCore;
  return dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot(holding)} onChange={() => undefined} />);
};

describe('OperatePanel manipulators', () => {
  it('VIS-010 a manipulator appears in the fault list with its actions and is not drawn as a stack light', () => {
    const { container } = render();
    const readout = container.querySelector('[data-plant-manipulator="Gantry1"]')!;
    expect(readout.textContent).toBe('Gantry1: X 0.52 m, Y 0.20 m, holding');
    // one stack light only: the real one
    expect([...container.querySelectorAll('[data-plant-stack]')].map((e) => (e as HTMLElement).dataset.plantStack)).toEqual(['Stack1']);
    const fault = container.querySelector<HTMLSelectElement>('[data-plant-fault="Gantry1"]')!;
    expect([...fault.options].map((o) => o.value)).toEqual(['', 'stuckX', 'gripFail']);
  });

  it('VIS-010 the readout says empty when nothing is held', () => {
    expect(render(false).container.querySelector('[data-plant-manipulator]')!.textContent).toBe('Gantry1: X 0.52 m, Y 0.20 m, empty');
  });

  it('VIS-008 the tank and the stack light readouts are unchanged', () => {
    const { container } = render();
    expect(container.querySelector('[data-plant-tank]')!.textContent).toBe('Tank1 level: 40 %');
    expect(container.querySelector('[data-plant-stack]')!.textContent).toContain('Amber');
  });
});
