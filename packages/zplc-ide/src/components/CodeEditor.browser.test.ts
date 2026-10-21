import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { translatorFor } from '../i18n';
import { browserApp, closeBrowserApp, type BrowserApp } from '../test/browser';

// VF-007: the Structured Text and Instruction List editors are Monaco, which needs a browser engine. These tests run in
// headless Chromium (src/test/browser.ts), press real keys, and read roles and names from the accessibility tree.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);
const en = translatorFor('en').t;
const es = translatorFor('es').t;

const ST = 'PROGRAM Main\nVAR\n  x : BOOL;\nEND_VAR\n\nEND_PROGRAM\n';
const IL = 'PROGRAM Main\nVAR\n  x : BOOL;\nEND_VAR\n\nEND_PROGRAM\n';

/** Focuses the text area of the editor through a click, then puts the caret on the blank line above END_PROGRAM. */
async function caretOnBlankLine(app: BrowserApp): Promise<void> {
  await app.click('.monaco-editor .view-lines');
  await app.press('Ctrl+End');
  await app.press('ArrowUp');
  await app.press('ArrowUp');
}

const editorName = (name: string, t: typeof en) => t('editors.code.label', { name });

describe('Structured Text editor in a browser (VF-007, LNG-015)', () => {
  test('is one text box named after the file, with the way out of the tab key in its name', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    const box = await app.axNode('textbox', editorName('src/main.st', en));
    expect(box.name).toContain('Ctrl+M');
    // the tab of the open file is a named tab of the same window
    expect((await app.ax()).some((node) => node.role === 'tab' && node.name === 'main.st')).toBe(true);
  });

  test('the name follows the interface language', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST }, 'es');
    await app.axNode('textbox', editorName('src/main.st', es));
    expect(editorName('src/main.st', es)).not.toBe(editorName('src/main.st', en));
  });

  test('typing with the keyboard changes the source text of the store', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    await caretOnBlankLine(app);
    await app.type('x := TRUE;');
    await app.until('the store to hold the typed text', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return s.loadedFiles.get(s.activeFileId)?.content.includes('x := TRUE;'); })`);
    expect(await app.fileContent()).toBe('PROGRAM Main\nVAR\n  x : BOOL;\nEND_VAR\nx := TRUE;\nEND_PROGRAM\n');
  });

  test('Ctrl+Space lists the declared variable as an option and Enter inserts it', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    await caretOnBlankLine(app);
    await app.press('Ctrl+ ');
    await app.axNode('listbox', 'Suggest');
    const option = await app.axNode('option', /^x\b/);
    expect(option.name).toContain('x');
    await app.type('x');
    await app.press('Enter');
    await app.until('the variable in the source', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return s.loadedFiles.get(s.activeFileId)?.content.includes('\\nx\\n'); })`);
  });

  test('a statement that does not parse is reported with its position and the report clears when it is fixed', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    await caretOnBlankLine(app);
    await app.type('x := 1 +;');
    const diagnostics = await app.until<Array<{ type: string; line: number; message: string }>>('a parser diagnostic', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const d = useIDEStore.getState().stBufferDiagnostics?.diagnostics ?? []; return d.length > 0 ? d : null; })`);
    expect(diagnostics[0]!.type).toBe('error');
    expect(diagnostics[0]!.line).toBe(5);
    for (let i = 0; i < 5; i++) await app.press('Backspace');
    await app.type('TRUE;');
    await app.until('no diagnostic', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => (useIDEStore.getState().stBufferDiagnostics?.diagnostics ?? []).length === 0 && useIDEStore.getState().stBufferDiagnostics !== null)`);
  });

  test('Tab is a character until Ctrl+M, then it moves the focus out of the editor', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    await caretOnBlankLine(app);
    await app.press('Tab');
    expect(await app.fileContent()).toMatch(/END_VAR\n +\nEND_PROGRAM/);
    await app.press('Ctrl+M');
    await app.press('Tab');
    const focused = await app.focused();
    expect(focused).toBeDefined();
    expect(focused!.name).not.toBe(editorName('src/main.st', en));
  });
});

describe('Instruction List editor in a browser (VF-007, LNG-015)', () => {
  test('is one text box named after the file and typing reaches the source text', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.il', language: 'IL', content: IL });
    await app.axNode('textbox', editorName('src/main.il', en));
    await caretOnBlankLine(app);
    await app.type('LD x');
    await app.until('the store to hold the typed text', `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return s.loadedFiles.get(s.activeFileId)?.content.includes('LD x'); })`);
    expect(await app.fileContent()).toContain('END_VAR\nLD x\nEND_PROGRAM');
  });

  test('Ctrl+Space offers the declared variable as an option', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.il', language: 'IL', content: IL });
    await caretOnBlankLine(app);
    await app.type('LD ');
    await app.press('Ctrl+ ');
    await app.axNode('listbox', 'Suggest');
    await app.axNode('option', /^x\b/);
  });
});
