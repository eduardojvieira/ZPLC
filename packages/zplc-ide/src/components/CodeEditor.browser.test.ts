import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { translatorFor } from '../i18n';
import { browserApp, closeBrowserApp, type BrowserApp } from '../test/browser';
import { contrastRatio, parseColor, toHex } from '../theme/color';
import { resolveTokens, type ThemeId } from '../theme/tokens';

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
    await app.until(
      'the store to hold the typed text',
      `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return ` +
        `s.loadedFiles.get(s.activeFileId)?.content.includes('x := TRUE;'); })`,
    );
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
    await app.until(
      'the variable in the source',
      `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return ` +
        `s.loadedFiles.get(s.activeFileId)?.content.includes('\\nx\\n'); })`,
    );
  });

  test('a statement that does not parse is reported with its position and the report clears when it is fixed', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: ST });
    await caretOnBlankLine(app);
    await app.type('x := 1 +;');
    const diagnostics = await app.until<Array<{ type: string; line: number; message: string }>>(
      'a parser diagnostic',
      `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const d = useIDEStore.getState().stBufferDiagnostics?.diagnostics ` +
        `?? []; return d.length > 0 ? d : null; })`,
    );
    expect(diagnostics[0]!.type).toBe('error');
    expect(diagnostics[0]!.line).toBe(5);
    for (let i = 0; i < 5; i++) await app.press('Backspace');
    await app.type('TRUE;');
    await app.until(
      'no diagnostic',
      `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => (useIDEStore.getState().stBufferDiagnostics?.diagnostics ?? ` +
        `[]).length === 0 && useIDEStore.getState().stBufferDiagnostics !== null)`,
    );
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

/** One of every kind of token the Structured Text grammar colours: keywords, declarations, types, literals, addresses, comments. */
const COLOURED = [
  'PROGRAM Main',
  'VAR',
  '  lamp AT %QX0.0 : BOOL;',
  '  period : TIME := T#500ms;',
  "  count : INT := 16#FF; name : STRING := 'tank';",
  'END_VAR',
  '(* the lamp follows the period *)',
  'lamp := NOT lamp AND TRUE;',
  'count := ABS(count) + 1;',
  'END_PROGRAM',
  '',
].join('\n');

interface Drawn {
  background: string;
  spans: Array<{ text: string; color: string }>;
}

/** The colour the page computes for the editor background and for every token span it draws. */
const drawn = (app: BrowserApp): Promise<Drawn> =>
  app.eval<Drawn>(`(() => {
    const background = getComputedStyle(document.querySelector('.monaco-editor .monaco-editor-background')).backgroundColor;
    const spans = [...document.querySelectorAll('.monaco-editor .view-lines .view-line > span > span')]
      .filter((span) => span.textContent.trim() !== '')
      .map((span) => ({ text: span.textContent.trim(), color: getComputedStyle(span).color }));
    return { background, spans };
  })()`);

const hexOf = (colour: string): string => toHex(parseColor(colour));

/** Waits until the editor draws its keyword in the keyword colour of `theme`, then checks every token against the background. */
async function expectReadableTokens(app: BrowserApp, theme: ThemeId): Promise<void> {
  const tokens = resolveTokens(theme);
  const keyword = hexOf(tokens['--syntax-keyword']);
  const keywordOf = (colours: Drawn) => colours.spans.find((span) => span.text === 'PROGRAM')?.color;
  let colours = await drawn(app);
  for (let tries = 0; tries < 50 && (keywordOf(colours) === undefined || hexOf(keywordOf(colours)!) !== keyword); tries++) {
    await Bun.sleep(100);
    colours = await drawn(app);
  }
  // The ZPLC theme of the app theme is the one Monaco applies, not the light base it falls back to.
  expect({ theme, keyword: hexOf(keywordOf(colours) ?? '#000') }).toEqual({ theme, keyword });
  expect(hexOf(colours.background)).toBe(hexOf(tokens['--editor-bg']));
  const identifier = colours.spans.find((span) => span.text === 'Main');
  expect(hexOf(identifier!.color)).toBe(hexOf(tokens['--editor-fg']));
  const weak = colours.spans
    .map((span) => ({ ...span, ratio: Number(contrastRatio(span.color, colours.background).toFixed(2)) }))
    .filter((span) => span.ratio < 4.5);
  expect({ theme, weak }).toEqual({ theme, weak: [] });
}

describe('code editor colours follow the theme of the app (UX-003, UX-024)', () => {
  test('a dark editor draws every token in the dark ZPLC theme from the first draw, at 4.5:1 or more', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: COLOURED }, 'en', 'dark');
    await expectReadableTokens(app, 'dark');
  });

  test('the colours switch with the app theme while the editor is open', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.st', language: 'ST', content: COLOURED });
    await expectReadableTokens(app, 'light');
    for (const theme of ['dark', 'high-contrast', 'light'] as const) {
      await app.eval(
        `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { useIDEStore.getState().setTheme('${theme}'); return true; })`,
      );
      await expectReadableTokens(app, theme);
    }
  });
});

describe('Instruction List editor in a browser (VF-007, LNG-015)', () => {
  test('is one text box named after the file and typing reaches the source text', async () => {
    const app = await browserApp();
    await app.open({ name: 'main.il', language: 'IL', content: IL });
    await app.axNode('textbox', editorName('src/main.il', en));
    await caretOnBlankLine(app);
    await app.type('LD x');
    await app.until(
      'the store to hold the typed text',
      `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return ` +
        `s.loadedFiles.get(s.activeFileId)?.content.includes('LD x'); })`,
    );
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
