/**
 * The browser environment of the editor render tests (VF-007).
 *
 * Monaco and React Flow need layout, canvas and a web worker, which happy-dom does not provide. A file named
 * `*.browser.test.ts` therefore drives the real renderer in headless Chromium: it starts the Vite dev server of this package
 * once per test process, opens the page with the DevTools driver of the smokes (`scripts/cdpHarness.ts`), seeds the store
 * with a project, and sends real key and pointer events. It asserts on the accessibility tree that Chromium computes (roles
 * and accessible names), on the DOM, and on the store. No display is needed. Set ZPLC_CHROMIUM_BIN when `chromium` or
 * `google-chrome` is not on the PATH.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { Cdp, freePort, HOST, openPage, stop, waitFor, type OwnedProcess } from '../../scripts/cdpHarness';

const PACKAGE = join(import.meta.dir, '..', '..');

export interface AxNode { role: string; name: string; value: string; focused: boolean; properties: Record<string, unknown> }
export type SeedFile = { name: string; language: 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC'; content: string };

const MODIFIERS: Record<string, number> = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 };
const NAMED_CODES: Record<string, number> = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, Insert: 45, F1: 112, F2: 113, F9: 120 };

/** Splits `Ctrl+Shift+Enter` into the modifier bits and the key. */
function parseChord(chord: string): { modifiers: number; key: string } {
  const parts = chord === '+' ? ['+'] : chord.split('+');
  const key = parts.pop()!;
  return { modifiers: parts.reduce((bits, name) => bits | (MODIFIERS[name] ?? 0), 0), key };
}

export class BrowserApp {
  readonly cdp: Cdp;
  readonly url: string;
  constructor(cdp: Cdp, url: string) { this.cdp = cdp; this.url = url; }

  eval<T = unknown>(expression: string): Promise<T> { return this.cdp.evaluate(expression) as Promise<T>; }

  /** Polls `expression` until it is truthy and returns the value; the page may reload once while Vite optimises a lazy editor. */
  async until<T>(description: string, expression: string, timeoutMs = 60_000): Promise<T> {
    return await waitFor<T>(description, async () => {
      const value = await this.cdp.evaluate(expression);
      return value ? value as T : undefined;
    }, timeoutMs);
  }

  /** Presses a chord such as `Ctrl+Enter` or `F2` on the focused element, as the keyboard sends it. */
  async press(chord: string): Promise<void> {
    const { modifiers, key } = parseChord(chord);
    const printable = key.length === 1;
    // a punctuation mark has no virtual key code of its own (the code of `(` is that of the Down arrow): the text is inserted as typed
    if (printable && modifiers === 0 && !/[a-z0-9 ]/i.test(key)) { await this.cdp.command('Input.insertText', { text: key }); return; }
    const code = NAMED_CODES[key] ?? (printable ? key.toUpperCase().charCodeAt(0) : 0);
    const text = printable && (modifiers & ~MODIFIERS.Shift!) === 0 ? key : undefined;
    const base = { modifiers, key, code: printable ? (key === ' ' ? 'Space' : /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : /\d/.test(key) ? `Digit${key}` : key) : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await this.cdp.command('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
    await this.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /** Types printable text the way the keyboard does, one key at a time. */
  async type(text: string): Promise<void> { for (const char of text) await this.press(char); }

  /** Clicks the centre of the first element that matches `selector`, with a real pointer event. */
  async click(selector: string, options: { button?: 'left' | 'right'; count?: number } = {}): Promise<void> {
    const box = await this.until<{ x: number; y: number }>(`${selector} to be visible`, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    await this.clickAt(box.x, box.y, options);
  }

  async clickAt(x: number, y: number, options: { button?: 'left' | 'right'; count?: number } = {}): Promise<void> {
    const button = options.button ?? 'left';
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : 2, clickCount: options.count ?? 1 });
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: options.count ?? 1 });
  }

  /** Drags from one point to another with the pointer, in small steps, so that a drag library sees real movement. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 8; step++) await this.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8, buttons: 1 });
    await this.cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
  }

  /** The accessibility tree as Chromium computes it, without the ignored nodes. */
  async ax(): Promise<AxNode[]> {
    await this.cdp.command('Accessibility.enable');
    const { nodes } = await this.cdp.command('Accessibility.getFullAXTree') as { nodes: Array<{ ignored?: boolean; role?: { value?: string }; name?: { value?: string }; value?: { value?: unknown }; properties?: Array<{ name: string; value: { value?: unknown } }> }> };
    return nodes.filter((node) => !node.ignored).map((node) => {
      const properties = Object.fromEntries((node.properties ?? []).map((property) => [property.name, property.value.value]));
      return { role: String(node.role?.value ?? ''), name: String(node.name?.value ?? ''), value: String(node.value?.value ?? ''), focused: properties.focused === true, properties };
    });
  }

  /** Waits until the tree holds a node of `role` whose name matches `name`, and returns it. */
  async axNode(role: string, name: string | RegExp, timeoutMs = 30_000): Promise<AxNode> {
    const matches = (candidate: string) => typeof name === 'string' ? candidate === name : name.test(candidate);
    return await waitFor(`${role} named ${String(name)} in the accessibility tree`, async () => (await this.ax()).find((node) => node.role === role && matches(node.name)), timeoutMs);
  }

  async axAbsent(role: string, name: string | RegExp): Promise<boolean> {
    const matches = (candidate: string) => typeof name === 'string' ? candidate === name : name.test(candidate);
    return !(await this.ax()).some((node) => node.role === role && matches(node.name));
  }

  /** What the two live regions of the window say now. */
  liveText(): Promise<string> { return this.eval(`[...document.querySelectorAll('[aria-live]')].map((el) => el.textContent).join(' ').trim()`); }

  /** The accessible name of the element that holds the focus, from the tree. */
  async focused(): Promise<AxNode | undefined> { return (await this.ax()).find((node) => node.focused && node.role !== 'RootWebArea'); }

  /** Loads the page afresh, so that a test never sees the editor models, focus or settings of the one before it. */
  async reload(): Promise<void> {
    await this.cdp.command('Page.navigate', { url: this.url });
    await this.until('the page', `location.protocol === 'http:' && document.readyState === 'complete' && document.querySelectorAll('button').length > 0`);
  }

  /** Reloads the page, puts a project with one open file in the store and waits for the page to draw it. Retries when Vite reloads the page to optimise a lazy editor. */
  async open(file: SeedFile, locale: 'en' | 'es' = 'en'): Promise<void> {
    const seed = `(async () => {
      const { useAppSettings } = await import('/src/store/useAppSettings.ts');
      const { useIDEStore } = await import('/src/store/useIDEStore.ts');
      useAppSettings.getState().update({ language: ${JSON.stringify(locale)} });
      const path = 'src/' + ${JSON.stringify(file.name)};
      const file = { id: 'f1', name: ${JSON.stringify(file.name)}, path, language: ${JSON.stringify(file.language)}, content: ${JSON.stringify(file.content)}, isModified: false, parentPath: 'src' };
      useIDEStore.getState().setTheme('light');
      useIDEStore.setState({
        isProjectOpen: true, projectName: 'Browser test', projectConfig: { name: 'Browser test', version: '1.0.0', target: 'posix', tasks: [], io: { inputs: [], outputs: [] } }, projectSession: 1, projectConfigDirty: false, directoryHandle: null,
        fileTree: { id: 'root', name: 'Browser test', type: 'directory', path: '', isExpanded: true, children: [{ id: 'src', name: 'src', type: 'directory', path: 'src', isExpanded: true, children: [{ id: 'f1', name: ${JSON.stringify(file.name)}, type: 'file', path, language: ${JSON.stringify(file.language)} }] }] },
        loadedFiles: new Map([['f1', file]]), activeFileId: 'f1', openTabs: ['f1'], activeConsoleTab: 'problems', isConsoleCollapsed: true, compilerMessages: [], compilerMessagesChecked: false, workspaceScenarioLink: null,
      });
      return true;
    })()`;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.reload();
        await this.eval(seed);
        await this.until('the editor', this.drawn(file.language));
        return;
      } catch (error) { if (attempt === 4) throw error; await Bun.sleep(500); }
    }
  }

  private drawn(language: SeedFile['language']): string {
    return language === 'ST' || language === 'IL' ? `document.querySelector('.monaco-editor .view-lines')?.textContent?.length > 0`
      : language === 'LD' ? `document.querySelector('[data-ld-rung-id]') !== null`
        : `document.querySelectorAll('.zplc-visual-editor .react-flow__node').length > 0`;
  }

  /** The source text of the open file, as the store holds it. */
  fileContent(): Promise<string> { return this.eval(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return s.loadedFiles.get(s.activeFileId)?.content ?? ''; })`); }
}

interface Running { app: BrowserApp; server: ViteDevServer; browser: OwnedProcess; scratch: string }
let running: Promise<Running> | undefined;

/**
 * The app of this test file. The first call starts Vite (in this process) and headless Chromium; `closeBrowserApp` in the
 * `afterAll` of the file stops them, so no server or browser outlives the run.
 */
export function browserApp(): Promise<BrowserApp> {
  running ??= (async () => {
    const root = process.env.TMPDIR ?? join(process.env.HOME ?? '.', '.cache', 'zplc-browser-tests');
    mkdirSync(root, { recursive: true });
    const scratch = mkdtempSync(join(root, 'browser-test-'));
    const port = await freePort();
    const server = await createServer({ root: PACKAGE, logLevel: 'silent', server: { host: HOST, port, strictPort: true } });
    await server.listen();
    const url = `http://${HOST}:${port}/`;
    const { browser, cdp } = await openPage(url, join(scratch, 'profile'));
    process.once('exit', () => { try { browser.kill('SIGKILL'); } catch { /* already gone */ } });
    return { app: new BrowserApp(cdp, url), server, browser, scratch };
  })();
  return running.then((value) => value.app);
}

/** Stops the browser and the server that `browserApp` started, and deletes the browser profile. */
export async function closeBrowserApp(): Promise<void> {
  const current = running;
  running = undefined;
  if (!current) return;
  const { app, server, browser, scratch } = await current;
  await app.cdp.command('Browser.close').catch(() => undefined);
  app.cdp.close();
  await stop(browser);
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
}

/** The parsed JSON of the open file: the document that a visual editor keeps in the store. */
export function openDocument<T = Record<string, unknown>>(app: BrowserApp): Promise<T> {
  return app.eval<T>(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const s = useIDEStore.getState(); return JSON.parse(s.loadedFiles.get(s.activeFileId).content); })`);
}

/** The centre of a React Flow node, in page coordinates. */
export function nodeCentre(app: BrowserApp, id: string): Promise<{ x: number; y: number }> {
  return app.eval(`(() => { const r = document.querySelector('.react-flow__node[data-id="${id}"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}

/** The centre of a port handle of a React Flow node (`data-handleid`), in page coordinates. */
export function handleCentre(app: BrowserApp, node: string, handle: string): Promise<{ x: number; y: number }> {
  return app.eval(`(() => { const r = document.querySelector('.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${handle}"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}
