import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { translatorFor } from '../../i18n';
import { browserApp, closeBrowserApp, type BrowserApp } from '../../test/browser';

// VF-007: the ladder editor in headless Chromium (src/test/browser.ts), with real key and pointer events.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);
const t = translatorFor('en').t;

const BLINKY = readFileSync(join(import.meta.dir, '..', '..', '..', 'projects', 'blinky', 'src', 'main.ld.json'), 'utf8');

async function openBlinky(app: BrowserApp): Promise<void> {
  await app.open({ name: 'main.ld.json', language: 'LD', content: BLINKY });
}

/** Clicks the empty cell (`row`, `col`) of a rung with a real pointer: the cell is 80 px wide and 60 px high. */
async function clickCell(app: BrowserApp, rung: string, row: number, col: number): Promise<void> {
  const box = await app.eval<{ x: number; y: number }>(`(() => { const e = document.querySelector('[data-ld-rung-id="${rung}"] [data-ld-cell="0,0"]'); const r = e.getBoundingClientRect(); return { x: r.x + ${col} * 80 + 40, y: r.y + ${row} * 60 + 30 }; })()`);
  await app.clickAt(box.x, box.y);
}

const rungsOf = (app: BrowserApp): Promise<Array<{ id: string; comment: string; elements: string[] }>> => app.eval(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).rungs.map((r) => ({ id: r.id, comment: r.comment ?? '', elements: r.grid.flat().filter((c) => c.element).map((c) => c.element.type + '/' + (c.element.variable ?? '')) })); })`);
const waitCursor = (app: BrowserApp, at: string) => app.until('the cursor on ' + at, `document.querySelector('[data-ld-cursor-at]')?.getAttribute('data-ld-cursor-at') === '${at}'`);
const SELECT = (kind: 'contact_nc' | 'contact_no' | 'coil_set', name: string) => `Select ${t(`ld.kind.${kind}` as const)} ${name}`;

describe('Ladder editor in a browser (VF-007, LNG-012)', () => {
  test('clicking an empty cell puts the cursor there and keeps the focus on the editor, not on the rung comment', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_2', 0, 3);
    await app.until('the cursor on the clicked cell', `document.querySelector('[data-ld-cursor-at]')?.getAttribute('data-ld-cursor-at') === 'rung_2:0,3'`);
    expect(await app.axAbsent('textbox', t('a11y.ld.comment'))).toBe(true);
    const focused = await app.focused();
    expect(focused?.role).toBe('region');
    expect(focused?.name).toBe(t('ld.ladderDiagramEditor'));
  });

  test('Shift+F2 opens the comment of the rung of the cursor with the focus in it, and Enter saves it into the file', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_2', 0, 3);
    await app.until('the cursor on the clicked cell', `document.querySelector('[data-ld-cursor-at]')?.getAttribute('data-ld-cursor-at') === 'rung_2:0,3'`);
    await app.press('Shift+F2');
    const box = await app.axNode('textbox', t('a11y.ld.comment'));
    expect(box.value).toContain('ON phase');
    await app.until('the focus in the comment', `document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(t('a11y.ld.comment'))}`);
    await app.type(' (checked)');
    await app.press('Enter');
    await app.until('the comment in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).rungs[1].comment.endsWith('(checked)'); })`);
    expect(await app.axAbsent('textbox', t('a11y.ld.comment'))).toBe(true);
  });

  test('is a named region with the toolbox, one rung per rung of the file and a named button for each element and rung command', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await app.axNode('region', t('ld.ladderDiagramEditor'));
    await app.axNode('button', t('editors.insert', { name: 'NO contact' }));
    await app.axNode('button', t('editors.insert', { name: 'TON' }));
    await app.axNode('button', t('ld.addRung'));
    for (const number of [1, 2, 3, 4]) await app.axNode('button', t('ld.breakpointOnRung', { number }));
    await app.axNode('button', SELECT('contact_nc', 'LED_Output'));
    await app.axNode('button', SELECT('coil_set', 'LED_Output'));
    expect(await rungsOf(app)).toHaveLength(4);
  });

  test('the c key inserts a contact at the cursor, asks for its variable in a named list, and Enter binds the chosen one', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_1', 0, 3);
    await waitCursor(app, 'rung_1:0,3');
    await app.press('c');
    const box = await app.axNode('combobox', t('ld.contactReads'));
    expect(box.focused).toBe(true);
    await app.axNode('listbox', new RegExp(`^${t('ld.contactReads')}`));
    await app.type('OnTimer');
    await app.axNode('option', /^OnTimer\.Q/);
    await app.press('Enter');
    await app.axNode('button', SELECT('contact_no', 'OnTimer.Q'));
    expect((await rungsOf(app))[0]!.elements).toContain('contact_no/OnTimer.Q');
    expect(await app.liveText()).toContain(t('ld.bound', { name: `${t('ld.kind.contact_no')} OnTimer.Q` }));
  });

  test('Escape leaves the question without inserting a binding and keeps the cursor', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_1', 0, 3);
    await waitCursor(app, 'rung_1:0,3');
    await app.press('c');
    await app.axNode('combobox', t('ld.contactReads'));
    await app.press('Escape');
    await app.until('the list closed', `!document.querySelector('[data-keyboard-picker]')`);
    expect(await app.axAbsent('combobox', t('ld.contactReads'))).toBe(true);
    await waitCursor(app, 'rung_1:0,3');
  });

  test('Ctrl+Enter adds a rung after the one of the cursor, announces it, and the file holds it', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_2', 0, 3);
    await waitCursor(app, 'rung_2:0,3');
    await app.press('Ctrl+Enter');
    await app.until('five rungs', `document.querySelectorAll('[data-ld-rung-id]').length === 5`);
    expect(await app.liveText()).toContain(t('ld.rungAdded', { rung: 3 }));
    const rungs = await rungsOf(app);
    expect(rungs).toHaveLength(5);
    expect(rungs[2]!.elements).toEqual([]);
    await app.axNode('button', t('ld.breakpointOnRung', { number: 5 }));
  });

  test('Delete removes the element under the cursor and says so', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await app.click(`[data-ld-element-id="nc_led_off"]`);
    await waitCursor(app, 'rung_1:0,0');
    await app.press('Delete');
    await app.until('the element gone', `!document.querySelector('[data-ld-element-id="nc_led_off"]')`);
    expect((await rungsOf(app))[0]!.elements).toEqual(['function_block/']);
    expect(await app.liveText()).toContain(t('ld.elementDeleted', { name: `${t('ld.kind.contact_nc')} LED_Output` }));
  });

  test('a toolbox button inserts its element at the cursor', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_1', 0, 3);
    await waitCursor(app, 'rung_1:0,3');
    await app.click(`button[aria-label="${t('editors.insert', { name: 'Set coil' })}"]`);
    await app.until('the coil in the file', `document.querySelectorAll('[data-ld-rung-id="rung_1"] [data-ld-element-id]').length === 3`);
    expect((await rungsOf(app))[0]!.elements).toContain('coil_set/');
  });

  test('F1 lists the commands in a named, searchable list and Enter runs the chosen one', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await clickCell(app, 'rung_2', 0, 3);
    await waitCursor(app, 'rung_2:0,3');
    await app.press('F1');
    const box = await app.axNode('combobox', t('editors.ld.commands'));
    expect(box.focused).toBe(true);
    await app.type('add a rung');
    await app.axNode('option', /^Add a rung after the rung of the cursor/);
    await app.press('Enter');
    await app.until('five rungs', `document.querySelectorAll('[data-ld-rung-id]').length === 5`);
    expect(await app.axAbsent('combobox', t('editors.ld.commands'))).toBe(true);
  });

  test('a breakpoint button of a rung is a toggle button that reports its state', async () => {
    const app = await browserApp();
    await openBlinky(app);
    const name = t('ld.breakpointOnRung', { number: 1 });
    expect((await app.axNode('button', name)).properties.pressed).toBe('false');
    await app.click(`button[aria-label="${name}"]`);
    await app.until('the button pressed', `document.querySelector('button[aria-label="${name}"]')?.getAttribute('aria-pressed') === 'true'`);
    expect((await app.axNode('button', name)).properties.pressed).toBe('true');
  });

  test('in Spanish the region, the toolbox and the commands carry Spanish names', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.ld.json', language: 'LD', content: BLINKY }, 'es');
    const es = translatorFor('es').t;
    await app.axNode('region', es('ld.ladderDiagramEditor'));
    await app.axNode('button', es('ld.addRung'));
    await app.axNode('button', es('ld.breakpointOnRung', { number: 1 }));
    expect(es('ld.ladderDiagramEditor')).not.toBe(t('ld.ladderDiagramEditor'));
  });
});
