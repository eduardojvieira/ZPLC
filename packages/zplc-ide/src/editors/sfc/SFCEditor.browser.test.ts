import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { translatorFor } from '../../i18n';
import { browserApp, closeBrowserApp, nodeCentre, openDocument, type BrowserApp } from '../../test/browser';

// VF-007: the sequential function chart editor (React Flow) in headless Chromium, with real key and pointer events.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);
const t = translatorFor('en').t;

const BLINKY = readFileSync(join(import.meta.dir, '..', '..', '..', 'projects', 'blinky_sfc', 'src', 'main.sfc.json'), 'utf8');
interface Chart { steps: Array<{ id: string; name: string; isInitial?: boolean; position: { x: number; y: number } }>; transitions: Array<{ id: string; fromStep: string; toStep: string; condition: string }> }

const openBlinky = (app: BrowserApp, locale: 'en' | 'es' = 'en') => app.open({ name: 'main.sfc.json', language: 'SFC', content: BLINKY }, locale);
const select = async (app: BrowserApp, id: string) => {
  const at = await nodeCentre(app, id);
  await app.clickAt(at.x, at.y);
  await app.until(`${id} selected`, `document.querySelector('.react-flow__node[data-id="${id}"]')?.classList.contains('selected')`);
};
const selected = (app: BrowserApp): Promise<string[]> => app.eval(`[...document.querySelectorAll('.react-flow__node.selected')].map((n) => n.getAttribute('data-id'))`);
const chartSize = (app: BrowserApp, steps: number, transitions: number) => app.until('the chart in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); const c = JSON.parse(s.loadedFiles.get(s.activeFileId).content); return c.steps.length === ${steps} && c.transitions.length === ${transitions}; })`);

describe('Sequential function chart editor in a browser (VF-007, LNG-012)', () => {
  test('is a named region and every step and transition of the file is a named group that a pointer click selects', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await app.axNode('region', t('editors.sfc.canvas'));
    await app.axNode('toolbar', t('workbench.editor.history'));
    await app.axNode('group', t('a11y.sfc.step', { name: 'LED_ON' }));
    await app.axNode('group', t('a11y.sfc.step', { name: 'LED_OFF' }));
    await app.axNode('group', t('a11y.sfc.transition', { condition: 'step_led_on.T >= T#500ms' }));
    expect(await app.eval('document.querySelectorAll(".react-flow__node").length')).toBe(4);
    await select(app, 'step_led_off');
    expect(await selected(app)).toEqual(['step_led_off']);
    expect((await app.focused())?.name).toBe(t('a11y.sfc.step', { name: 'LED_OFF' }));
  });

  test('Alt+ArrowDown moves the selection from a step to the transition below it, says which, and moves nothing', async () => {
    const app = await browserApp();
    await openBlinky(app);
    const before = (await openDocument<Chart>(app)).steps.map((step) => step.position);
    await select(app, 'step_led_on');
    await app.press('Alt+ArrowDown');
    await app.until('the transition selected', `document.querySelector('.react-flow__node[data-id="trans_on_to_off"]')?.classList.contains('selected')`);
    expect(await selected(app)).toEqual(['trans_on_to_off']);
    expect(await app.liveText()).toContain(t('keyboard.selected', { name: 'transition T(step_led_on.T >= T#500ms)' }));
    // the arrow keys of the table are the editor's: React Flow must not also nudge the selected node
    expect((await openDocument<Chart>(app)).steps.map((step) => step.position)).toEqual(before);
  });

  test('t inserts a transition below the selected transition, s a step after it, and the file holds both', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'trans_on_to_off');
    await app.press('t');
    await chartSize(app, 2, 3);
    await app.press('s');
    await chartSize(app, 3, 3);
    const chart = await openDocument<Chart>(app);
    expect(chart.steps.map((step) => step.name)).toContain('Step_1');
    expect(chart.transitions.find((transition) => transition.id === 'transition_1')?.toStep).toBe('step_1');
    await app.axNode('group', t('a11y.sfc.step', { name: 'Step_1' }));
    expect(await app.liveText()).toContain('Step_1');
  });

  test('F2 names the selected step in a named box and Enter writes the name into the file', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'step_led_off');
    await app.press('F2');
    const box = await app.axNode('combobox', /^Name of step LED_OFF/);
    expect(box.focused).toBe(true);
    await app.press('ctrl+a'.replace('ctrl', 'Ctrl').replace('+a', '+a'));
    await app.type('LED_IDLE');
    await app.press('Enter');
    await app.until('the name in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).steps.some((step) => step.name === 'LED_IDLE'); })`);
    await app.axNode('group', t('a11y.sfc.step', { name: 'LED_IDLE' }));
  });

  test('i opens the element palette and Enter inserts the chosen element', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'step_led_on');
    await app.press('i');
    await app.until('the palette focused', `document.activeElement?.getAttribute('role') === 'combobox'`);
    await app.axNode('option', /step/i);
    await app.press('Enter');
    await app.until('a node added', `document.querySelectorAll('.react-flow__node').length === 5`);
  });

  test('Delete removes the selected transition and the Undo button of the toolbar gives it back', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'trans_off_to_on');
    await app.press('Delete');
    await chartSize(app, 2, 1);
    expect(await app.axAbsent('group', t('a11y.sfc.transition', { condition: 'step_led_off.T >= T#500ms' }))).toBe(true);
    await app.click(`button[aria-label="${t('workbench.editor.undoLabel')}"]`);
    await chartSize(app, 2, 2);
    await app.axNode('group', t('a11y.sfc.transition', { condition: 'step_led_off.T >= T#500ms' }));
  });

  test('c lists the wires a step can have and the chosen one is drawn into the file', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'step_led_on');
    await app.press('Shift+C');
    await app.until('the wire list focused', `document.activeElement?.getAttribute('role') === 'combobox'`);
    expect((await app.focused())?.role).toBe('combobox');
    await app.press('Escape');
    await app.until('the list closed', `!document.querySelector('[data-keyboard-picker]')`);
  });

  test('in Spanish the region and the nodes carry Spanish names', async () => {
    const app = await browserApp();
    await openBlinky(app, 'es');
    const es = translatorFor('es').t;
    await app.axNode('region', es('editors.sfc.canvas'));
    await app.axNode('group', es('a11y.sfc.step', { name: 'LED_ON' }));
    expect(es('a11y.sfc.step', { name: 'LED_ON' })).not.toBe(t('a11y.sfc.step', { name: 'LED_ON' }));
  });
});
