import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { translatorFor } from '../../i18n';
import { browserApp, closeBrowserApp, handleCentre, nodeCentre, openDocument, type BrowserApp } from '../../test/browser';

// VF-007: the function block diagram editor (React Flow) in headless Chromium, with real key and pointer events.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);
const t = translatorFor('en').t;

const BLINKY = readFileSync(join(import.meta.dir, '..', '..', '..', 'projects', 'blinky_fbd', 'src', 'main.fbd.json'), 'utf8');
interface Diagram { blocks: Array<{ id: string; type: string; variableName?: string; position: { x: number; y: number } }>; connections: Array<{ from: { block: string; port: string }; to: { block: string; port: string } }> }

const openBlinky = (app: BrowserApp, locale: 'en' | 'es' = 'en') => app.open({ name: 'main.fbd.json', language: 'FBD', content: BLINKY }, locale);
const select = async (app: BrowserApp, id: string) => {
  const at = await nodeCentre(app, id);
  await app.clickAt(at.x, at.y);
  await app.until(`${id} selected`, `document.querySelector('.react-flow__node[data-id="${id}"]')?.classList.contains('selected')`);
};
const selected = (app: BrowserApp): Promise<string[]> => app.eval(`[...document.querySelectorAll('.react-flow__node.selected')].map((n) => n.getAttribute('data-id'))`);
const label = (kind: string, name: string) => t('a11y.fbd.node', { kind, name });

describe('Function block diagram editor in a browser (VF-007, LNG-012)', () => {
  test('is a named region and every block of the file is a named group that a pointer click selects', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await app.axNode('region', t('editors.fbd.canvas'));
    await app.axNode('toolbar', t('workbench.editor.history'));
    for (const [kind, name] of [['variable', 'LED_Output'], ['NOT', 'not_led'], ['TON', 'OffTimer'], ['TON', 'OnTimer'], ['OR', 'or_set_or_hold'], ['output', 'LED_Output']] as const) await app.axNode('group', label(kind, name));
    expect(await app.eval('document.querySelectorAll(".react-flow__node").length')).toBe(9);
    await select(app, 'ton_off');
    expect(await selected(app)).toEqual(['ton_off']);
    expect((await app.focused())?.name).toBe(label('TON', 'OffTimer'));
  });

  test('Alt+ArrowRight selects the nearest block to the right, says which, and moves nothing', async () => {
    const app = await browserApp();
    await openBlinky(app);
    const before = (await openDocument<Diagram>(app)).blocks.map((block) => block.position);
    await select(app, 'var_led_read');
    await app.press('Alt+ArrowRight');
    await app.until('the next block selected', `document.querySelector('.react-flow__node[data-id="not_led"]')?.classList.contains('selected')`);
    expect(await selected(app)).toEqual(['not_led']);
    expect(await app.liveText()).toContain(t('keyboard.selected', { name: 'NOT' }));
    // the arrow keys of the table are the editor's: React Flow must not also nudge the selected block
    expect((await openDocument<Diagram>(app)).blocks.map((block) => block.position)).toEqual(before);
  });

  test('v inserts a variable block next to the selection, asks which variable, and Enter binds the chosen one', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'not_led');
    await app.press('v');
    const box = await app.axNode('combobox', t('fbd.bind.title'));
    expect(box.focused).toBe(true);
    await app.axNode('option', /^LED_Output/);
    await app.press('Enter');
    await app.until('the block in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).blocks.length === 10; })`);
    const diagram = await openDocument<Diagram>(app);
    expect(diagram.blocks.filter((block) => block.type === 'variable' && block.variableName === 'LED_Output')).toHaveLength(2);
    expect(await app.eval('document.querySelectorAll(".react-flow__node").length')).toBe(10);
  });

  test('i opens the block palette, typing filters it, and Enter inserts the chosen block next to the selection', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'and_run');
    await app.press('i');
    expect((await app.axNode('combobox', t('fbd.paletteTitle'))).focused).toBe(true);
    await app.type('NAND');
    await app.axNode('option', /^NAND\b/);
    await app.press('Enter');
    await app.until('the block in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).blocks.some((b) => b.type === 'NAND'); })`);
    expect(await app.liveText()).toContain(t('fbd.inserted', { type: 'NAND', instance: '' }));
  });

  test('c lists the wires the selected block can have and Enter draws the chosen one; Shift+C removes one', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'ton_off');
    await app.press('c');
    await app.axNode('combobox', /^Draw a wire of OffTimer/);
    await app.axNode('option', /^OffTimer\.Q → LED_Output\.IN/);
    await app.press('Enter');
    await app.until('the wire in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).connections.length === 12; })`);
    expect((await openDocument<Diagram>(app)).connections.some((wire) => wire.from.block === 'ton_off' && wire.from.port === 'Q' && wire.to.block === 'var_led_read')).toBe(true);
    await select(app, 'ton_off');
    await app.press('Shift+C');
    await app.axNode('combobox', /^Remove a wire of OffTimer/);
    await app.axNode('option', /^constant\.OUT → OffTimer\.PT/);
    await app.type('constant');
    await app.press('Enter');
    await app.until('the wire gone', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).connections.length === 11; })`);
  });

  test('dragging from an output handle to an input handle with the pointer draws a wire', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'and_run');
    await app.press('i');
    await app.type('NAND');
    await app.press('Enter');
    await app.until('the new block', `document.querySelectorAll('.react-flow__node').length === 10`);
    await app.press('Ctrl+Alt+0');
    await app.until('the diagram fitted', `document.body.textContent.includes(${JSON.stringify(t('editor.fit.diagram'))})`);
    await Bun.sleep(1_200); // the fit-view animation
    const blocks = await app.eval<string[]>(`[...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id'))`);
    const added = blocks.find((id) => !['var_led_read', 'not_led', 'const_500ms', 'ton_off', 'ton_on', 'not_on_done', 'or_set_or_hold', 'and_run', 'output_led'].includes(id))!;
    await app.drag(await handleCentre(app, 'ton_on', 'Q'), await handleCentre(app, added, 'IN1'));
    await app.until('the wire in the file', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content).connections.some((w) => w.from.block === 'ton_on' && w.from.port === 'Q' && w.to.port === 'IN1' && w.to.block !== 'not_on_done'); })`);
    expect(await app.eval('document.querySelectorAll(".react-flow__edge").length')).toBe(12);
  });

  test('Delete removes the selected block with its wires and the Undo button of the toolbar gives them back', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'not_led');
    await app.press('Delete');
    await app.until('the block gone', `!document.querySelector('.react-flow__node[data-id="not_led"]')`);
    const after = await openDocument<Diagram>(app);
    expect(after.blocks.some((block) => block.id === 'not_led')).toBe(false);
    expect(after.connections.some((wire) => wire.from.block === 'not_led' || wire.to.block === 'not_led')).toBe(false);
    await app.click(`button[aria-label="${t('workbench.editor.undoLabel')}"]`);
    await app.until('the block back', `!!document.querySelector('.react-flow__node[data-id="not_led"]')`);
    const restored = await openDocument<Diagram>(app);
    expect(restored.connections).toHaveLength(11);
  });

  test('Ctrl+Alt+A selects every block and F1 lists the commands in a named list', async () => {
    const app = await browserApp();
    await openBlinky(app);
    await select(app, 'not_led');
    await app.press('Ctrl+Alt+a');
    await app.until('every block selected', `document.querySelectorAll('.react-flow__node.selected').length === 9`);
    await app.press('F1');
    // the title of this list is not in the catalog yet (useCanvasKeyboard.tsx), so the list is found by its role and its focus
    await app.until('the command list focused', `document.activeElement?.getAttribute('role') === 'combobox'`);
    await app.axNode('option', /^Align the selected elements to the leftmost one/);
    await app.press('Escape');
    await app.until('the list closed', `!document.querySelector('[data-keyboard-picker]')`);
  });

  test('in Spanish the region and the toolbar carry Spanish names', async () => {
    const app = await browserApp();
    await openBlinky(app, 'es');
    const es = translatorFor('es').t;
    await app.axNode('region', es('editors.fbd.canvas'));
    await app.axNode('toolbar', es('workbench.editor.history'));
    expect(es('editors.fbd.canvas')).not.toBe(t('editors.fbd.canvas'));
  });
});
