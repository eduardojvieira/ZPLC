import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { registerParts, catalogue } = await import('../core/catalogue');
const { liftParts } = await import('../core/parts/lift');
const { stackerParts } = await import('../core/parts/stackerCrane');
const { machiningParts } = await import('../core/parts/machining');
const { plantViewEn, plantViewEs } = await import('../../i18n/catalog/plantView');
import type { PartView, PlantCore, PlantSceneFile, PlantSnapshot, ScenePart } from '../contracts';

// The REAL definitions of the M5 parts; K10 registers them in the plant core, so here they are registered only when absent.
const REAL = [...liftParts, ...stackerParts, ...machiningParts];
registerParts(REAL.filter((d) => !catalogue.get(d.id)));
// B4 (limit switch, aligner, chute) is written in parallel and lands in `parts/completion.ts`; its labels are checked once it is in.
const completion = await import('../core/parts/completion' as string).then(
  (m: { completionParts: readonly { id: string; actions: readonly string[] }[] }) => m.completionParts,
  () => [] as readonly { id: string; actions: readonly string[] }[],
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
const lift = part('l', 'lift', 'Lift1');
const crane = part('c', 'stacker-crane', 'Crane1');
const machine = part('m', 'machining-centre', 'Mill1');
const stack = part('k', 'stack-light', 'Stack1');
const scene: PlantSceneFile = { schemaVersion: 1, name: 'Stations', parts: [lift, crane, machine, stack], cameras: [] };
const snapshot: PlantSnapshot = {
  timeMs: 0,
  scans: 0,
  parts: [
    view(lift, { text: 'level 2', fraction: 0.5 }),
    view(crane, { text: 'bay 2, level 1, fork centre', fraction: 0 }),
    view(machine, { text: 'busy 2.5 s', fraction: 0.4 }),
    view(stack, {}),
  ],
  items: [],
  facts: {},
};
const mount = (log: string[] = []) => {
  const core = { operate: () => undefined, act: (n: string, a: string) => void log.push(`${n} ${a}`) } as unknown as PlantCore;
  return dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot} onChange={() => undefined} />);
};

describe('OperatePanel station parts', () => {
  it('VIS-008 a lift, a stacker crane and a machining centre read as their own text, none as a stack light or a manipulator', () => {
    const { container } = mount();
    const text = (name: string) => container.querySelector(`[data-plant-station="${name}"]`)?.textContent;
    expect(text('Lift1')).toBe('Lift Lift1: level 2');
    expect(text('Crane1')).toBe('Stacker crane Crane1: bay 2, level 1, fork centre');
    expect(text('Mill1')).toBe('Machining centre Mill1: busy 2.5 s');
    expect(container.querySelector('[data-plant-manipulator]')).toBeNull();
    expect([...container.querySelectorAll('[data-plant-stack]')].map((e) => (e as HTMLElement).dataset.plantStack)).toEqual(['Stack1']);
  });

  it('VIS-010 a lift, a crane and a machining centre appear in the fault list with their actions, choosing does not trigger', () => {
    const log: string[] = [];
    const { container } = mount(log);
    const expected: Record<string, string[]> = {
      Lift1: ['stuck', 'stall', 'levelStuckOff'],
      Crane1: ['stuckX', 'stuckY', 'forkStuck', 'loadedStuckOff', 'beltStall'],
      Mill1: ['doorStuck', 'cycleSlow', 'readyStuckOff', 'stall'],
    };
    for (const [name, actions] of Object.entries(expected)) {
      const select = container.querySelector<HTMLSelectElement>(`[data-plant-fault="${name}"]`)!;
      expect([...select.options].map((o) => o.value)).toEqual(['', ...actions]);
      expect([...select.options].slice(1).map((o) => o.textContent)).toEqual(
        actions.map((a) => plantViewEn[`plant.fault.${a}` as keyof typeof plantViewEn]),
      );
    }
    const select = container.querySelector<HTMLSelectElement>('[data-plant-fault="Crane1"]')!;
    const trigger = container.querySelector<HTMLButtonElement>('[data-plant-fault-trigger="Crane1"]')!;
    dom.fireEvent.change(select, { target: { value: 'forkStuck' } });
    expect(log).toEqual([]);
    dom.fireEvent.click(trigger);
    expect(log).toEqual(['Crane1 forkStuck']);
  });

  it('PLT-011 every action of every M5 part has a plant.fault label in both catalogues', () => {
    const all = [...REAL, ...completion];
    expect(all.map((d) => d.id)).toEqual(expect.arrayContaining(['lift', 'stacker-crane', 'machining-centre']));
    for (const action of new Set(all.flatMap((d) => d.actions))) {
      expect(plantViewEn[`plant.fault.${action}` as keyof typeof plantViewEn]).toBeTruthy();
      expect(plantViewEs[`plant.fault.${action}` as keyof typeof plantViewEs]).toBeTruthy();
    }
  });

  it('VIS-011 the station panel strings exist in English and Spanish with the same placeholders', () => {
    for (const key of ['plant.panel.lift', 'plant.panel.crane', 'plant.panel.machine'] as const) {
      expect(plantViewEs[key]).not.toBe(plantViewEn[key]);
      expect(plantViewEs[key]).toContain('{name}');
      expect(plantViewEs[key]).toContain('{text}');
    }
  });

  it('VIS-008 the tank, stack light, manipulator, sorting and support readouts are unchanged', () => {
    const { container } = mount();
    expect(container.querySelector('[data-plant-stack]')!.textContent).toContain('Red');
    expect(container.querySelector('[data-plant-tank]')).toBeNull();
    expect(container.querySelector('[data-plant-diverter]')).toBeNull();
  });
});
