import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { OperatePanel } = await import('./OperatePanel');
const { registerParts, catalogue } = await import('../core/catalogue');
const { panelParts } = await import('../core/parts/panel');
const { plantViewEn, plantViewEs } = await import('../../i18n/catalog/plantView');
import type { PartView, PlantCore, PlantSceneFile, PlantSnapshot, ScenePart } from '../contracts';

registerParts(panelParts.filter((d) => !catalogue.get(d.id)));

const part = (id: string, kind: string, name: string, config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: kind,
  name,
  position: [0, 0, 0],
  rotationYDeg: 0,
  config,
});
const view = (p: ScenePart, state: PartView['state'], signals: PartView['signals'] = {}): PartView => ({
  id: p.id,
  part: p.part,
  name: p.name,
  pose: { id: p.id, part: p.part, kind: 'box', size: [0.1, 0.1, 0.1], p: [0, 0, 0], q: [0, 0, 0, 1] },
  state,
  signals,
});

const pot = part('p', 'potentiometer', 'Pot1');
const sel = part('s', 'selector-switch', 'Sel1', { output: 'integer' });
const selContacts = part('c', 'selector-switch', 'Sel2');
const estop = part('e', 'emergency-stop', 'Estop1');
const display = part('d', 'numeric-display', 'Disp1');
const stack = part('k', 'stack-light', 'Stack1');
const tank = part('t', 'tank', 'Tank1');
const button = part('b', 'push-button', 'Start');
const light = part('l', 'indicator-light', 'Lamp');

const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'Panel',
  parts: [pot, sel, selContacts, estop, display, stack, tank, button, light],
  cameras: [],
};
const snapshot = (pressed = false): PlantSnapshot => ({
  timeMs: 0,
  scans: 0,
  parts: [
    view(pot, { value: 25, min: 0, max: 100, fraction: 0.25, unit: '%', text: '25.0 %' }, { 'Pot1.value': 25 }),
    view(sel, { position: 1, positions: 3 }, { 'Sel1.position': 1 }),
    view(selContacts, { position: 0, positions: 3 }, { 'Sel2.pos0': true, 'Sel2.pos1': false, 'Sel2.pos2': false }),
    view(estop, { pressed, ok: !pressed }, { 'Estop1.pressed': pressed, 'Estop1.ok': !pressed }),
    view(display, { value: 7.5, min: 0, max: 10, fraction: 0.75, unit: 'm', text: '7.5 m' }, { value: 7.5 }),
    view(stack, { red: false, amber: true, green: false }, { red: false, amber: true, green: false }),
    view(tank, { level: 0.4, heightM: 1, fraction: 0.4, spilling: false }, { level: 0.4 }),
    view(light, {}, { 'Lamp.lit': true }),
  ],
  items: [],
  facts: {},
});

/**
 * What a browser does on a pointer drag or an arrow key: the native value changes and the input is told. The harness loads
 * React before the DOM exists, so React listens to text-like inputs through its key-up fallback and the slider must be focused.
 */
function slide(slider: HTMLInputElement, value: number, key = 'ArrowRight') {
  dom.act(() => slider.focus());
  dom.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(slider, String(value));
    dom.fireEvent.keyUp(slider, { key });
  });
}

function rig(pressed = false) {
  const log: string[] = [];
  const core = {
    operate: (signal: string, value: unknown) => void log.push(`operate ${signal} ${String(value)}`),
    act: () => undefined,
    addItem: () => 'x',
    removeItem: () => undefined,
  } as unknown as PlantCore;
  const ui = dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot(pressed)} onChange={() => undefined} />);
  return { log, ui };
}

describe('OperatePanel numeric parts', () => {
  it('VIS-010 a potentiometer is operated by the pointer and by the arrow keys', () => {
    const { log, ui } = rig();
    const slider = ui.container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0', '100', '1', '25']);
    expect(slider.getAttribute('aria-valuetext')).toBe('25 %');
    slide(slider, 60, 'Pointer');
    expect(log).toEqual(['operate Pot1.value 60']);
    // The arrow keys are the platform's own: the slider is a focusable native range.
    expect(slider.tabIndex).toBeGreaterThanOrEqual(0);
    slide(slider, 26);
    expect(log).toEqual(['operate Pot1.value 60', 'operate Pot1.value 26']);
  });

  it('VIS-010 a potentiometer keeps the value being set until the plant reports it', () => {
    const { log, ui } = rig();
    const slider = ui.container.querySelector<HTMLInputElement>('input[type="range"]')!;
    // Two arrow-up presses with no new snapshot between them: each steps from what the slider shows.
    slide(slider, Number(slider.value) + Number(slider.step));
    expect(slider.value).toBe('26');
    slide(slider, Number(slider.value) + Number(slider.step));
    expect(slider.value).toBe('27');
    expect(log).toEqual(['operate Pot1.value 26', 'operate Pot1.value 27']);
  });

  it('VIS-010 a selector is operated from a list by keyboard', () => {
    const { log, ui } = rig();
    const lists = [...ui.container.querySelectorAll<HTMLSelectElement>('[data-plant-selector]')];
    expect(lists.map((s) => [s.dataset.plantSelector, s.value, s.options.length])).toEqual([
      ['Sel1', '1', 3],
      ['Sel2', '0', 3],
    ]);
    dom.fireEvent.change(lists[0]!, { target: { value: '2' } });
    dom.fireEvent.change(lists[1]!, { target: { value: '1' } });
    expect(log).toEqual(['operate Sel1.position 2', 'operate Sel2.pos1 true']);
  });

  it('VIS-010 an emergency stop toggles and exposes aria-pressed', () => {
    const released = rig();
    const button = released.ui.container.querySelector<HTMLButtonElement>('[data-plant-estop]')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    dom.fireEvent.click(button);
    expect(released.log).toEqual(['operate Estop1.pressed true']);
    released.ui.unmount();
    const held = rig(true);
    const again = held.ui.container.querySelector<HTMLButtonElement>('[data-plant-estop]')!;
    expect(again.getAttribute('aria-pressed')).toBe('true');
    dom.fireEvent.click(again);
    expect(held.log).toEqual(['operate Estop1.pressed false']);
  });

  it('VIS-010 a numeric display and a stack light have a text state other than colour', () => {
    const { ui } = rig();
    expect(ui.container.querySelector('[data-plant-display]')!.textContent).toBe('Disp1: 7.5 m');
    expect(ui.container.querySelector('[data-plant-tank]')!.textContent).toBe('Tank1 level: 40 %');
    const lamps = [...ui.container.querySelectorAll('[data-lamp]')].map((l) => l.textContent);
    expect(lamps).toEqual(['○ Red: off', '● Amber: on', '○ Green: off']);
  });

  it('VIS-010 the M1 push button and indicator light behave as before', () => {
    const { log, ui } = rig();
    const press = ui.container.querySelector<HTMLButtonElement>('[data-plant-press="Start"]')!;
    dom.fireEvent.pointerDown(press);
    expect(press.getAttribute('aria-pressed')).toBe('true');
    dom.fireEvent.pointerUp(press);
    expect(press.getAttribute('aria-pressed')).toBe('false');
    expect(log).toEqual(['operate Start.pressed true', 'operate Start.pressed false']);
    const lamp = ui.container.querySelector<HTMLElement>('[data-plant-light="Lamp"]')!;
    expect(lamp.dataset.state).toBe('true');
    expect(lamp.textContent).toContain('Lamp: Confirmed TRUE');
  });

  it('VIS-011 every new string exists in English and Spanish', () => {
    expect(Object.keys(plantViewEs).sort()).toEqual(Object.keys(plantViewEn).sort());
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(plantViewEn).filter((k) =>
      /^plant\.(panel\.(valueText|position|estop|display|tank|lamp)|text\.level)/.test(k),
    )) {
      const k = key as keyof typeof plantViewEn;
      expect(plantViewEs[k]).not.toBe('');
      expect(holes(plantViewEs[k])).toEqual(holes(plantViewEn[k]));
    }
    expect(plantViewEn['plant.text.level']).toContain('{percent}');
  });

  it('VIS-010 a refused operation is shown as the panel message', () => {
    const core = {
      operate: () => {
        throw new RangeError('plant: Pot1.value 500 is above the limit 100 %');
      },
    } as unknown as PlantCore;
    const ui = dom.render(<OperatePanel scene={scene} core={core} snapshot={snapshot()} onChange={() => undefined} />);
    slide(ui.container.querySelector<HTMLInputElement>('input[type="range"]')!, 60);
    expect(ui.container.querySelector('[data-plant-message]')!.textContent).toContain('is above the limit');
  });
});
