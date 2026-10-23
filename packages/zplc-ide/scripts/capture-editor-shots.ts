/**
 * One picture of each language editor, in English and in Spanish, for the language reference (DOC-006, DOC-013).
 *
 *   bun run scripts/capture-editor-shots.ts <folder>
 *
 * Headless Chromium over CDP against the Vite renderer, as scripts/smoke-studio-vertical.ts does, so it needs no display and
 * no Electron. The frame is fixed (1366x768, scale 1, a fixed project name; each editor in light and in dark) so a second run on the same
 * build
 * writes the same bytes. The folder gets `<language>-<locale>.png` and `<language>-<locale>-dark.png` for st, il, ld, fbd and sfc. The
 * caller
 * (tools/docs/capture-screenshots.ts --editors) hashes the files and writes the manifest.
 */
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const HOST = '127.0.0.1';
const TIMEOUT_MS = 30_000;
const WIDTH = 1366;
const HEIGHT = 768;
const PROJECTS = join(import.meta.dir, '..', 'projects');

/** The example each language page shows: the 50% LED blinker in that language (the bundled examples of the Welcome screen). */
const EXAMPLES = [
  { language: 'st', project: 'blinky_st', file: 'main.st', kind: 'ST' },
  { language: 'il', project: 'blinky_il', file: 'main.il', kind: 'IL' },
  { language: 'ld', project: 'blinky', file: 'main.ld.json', kind: 'LD' },
  { language: 'fbd', project: 'blinky_fbd', file: 'main.fbd.json', kind: 'FBD' },
  { language: 'sfc', project: 'blinky_sfc', file: 'main.sfc.json', kind: 'SFC' },
] as const;
const LOCALES = ['en', 'es'] as const;
const THEMES = ['light', 'dark'] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function chromium(): string {
  for (const path of [process.env.ZPLC_CHROMIUM_BIN, process.env.CHROME_BIN]) {
    if (path) {
      try {
        accessSync(path, constants.X_OK);
        return path;
      } catch {
        /* next */
      }
    }
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = Bun.which(name);
    if (found) return found;
  }
  throw new Error('Chrome/Chromium not found. Set ZPLC_CHROMIUM_BIN to an executable browser path.');
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0)));
    });
  });
}

async function waitFor<T>(description: string, check: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
}

async function stop(process: ReturnType<typeof Bun.spawn> | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill();
  await Promise.race([process.exited, Bun.sleep(3_000)]);
  if (process.exitCode === null) {
    process.kill('SIGKILL');
    await process.exited;
  }
}

class Cdp {
  readonly errors: string[] = [];
  #nextId = 1;
  #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
        method?: string;
        params?: { exceptionDetails?: { text?: string; exception?: { description?: string } } };
      };
      if (message.method === 'Runtime.exceptionThrown')
        this.errors.push(
          message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Runtime exception',
        );
      const pending = message.id ? this.#pending.get(message.id) : undefined;
      if (!message.id || !pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed'));
      else pending.resolve(message.result);
    });
  }
  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP connection failed')), { once: true });
    });
    return new Cdp(socket);
  }
  command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, TIMEOUT_MS);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression: string): Promise<unknown> {
    const result = (await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
      result?: { value?: unknown };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Page evaluation failed');
    return result.result?.value;
  }
  close(): void {
    this.socket.close();
  }
}

/** Opens the example in the editor of the running renderer, with the interface in `locale`, and waits until it is drawn. */
async function show(
  cdp: Cdp,
  example: (typeof EXAMPLES)[number],
  locale: (typeof LOCALES)[number],
  theme: (typeof THEMES)[number],
): Promise<void> {
  const root = join(PROJECTS, example.project);
  const content = readFileSync(join(root, 'src', example.file), 'utf8');
  const config = JSON.parse(readFileSync(join(root, 'zplc.json'), 'utf8')) as unknown;
  const path = `src/${example.file}`;
  await cdp.evaluate(
    `(async () => {
    const { useAppSettings } = await import('/src/store/useAppSettings.ts');
    const { useIDEStore } = await import('/src/store/useIDEStore.ts');
    useAppSettings.getState().update({ language: ${JSON.stringify(locale)} });
    const file = { id: 'shot', ` +
      `name: ${JSON.stringify(example.file)}, path: ${JSON.stringify(path)}, language: ${JSON.stringify(
        example.kind,
      )}, content: ${JSON.stringify(content)}, isModified: false, parentPath: 'src' };
    useIDEStore.getState().setTheme(${JSON.stringify(theme)});
    useIDEStore.setState({
      isProjectOpen: true, projectName: 'Blinky', projectConfig: ${JSON.stringify(config)}, projectSession: 1, projectConfigDirty: ` +
      `false, directoryHandle: null,
      fileTree: { id: 'root', name: 'Blinky', type: 'directory', path: '', isExpanded: true, children: [{ id: 'src', name: 'src', type: ` +
      `'directory', path: 'src', isExpanded: true, children: [{ id: 'shot', ` +
      `name: ${JSON.stringify(
        example.file,
      )}, type: 'file', path: ${JSON.stringify(path)}, language: ${JSON.stringify(example.kind)} }] }] },
      loadedFiles: new Map([['shot', file]]), activeFileId: 'shot', openTabs: ['shot'], activeConsoleTab: 'problems', ` +
      `isConsoleCollapsed: true, compilerMessages: [], compilerMessagesChecked: false, workspaceScenarioLink: null,
    });
  })()`,
  );
  const text = example.kind === 'ST' || example.kind === 'IL';
  await waitFor(`${example.language} editor`, async () =>
    (await cdp.evaluate(
      text
        ? `document.querySelector('.monaco-editor .view-lines')?.textContent?.length > 40 ? true : undefined`
        : example.kind === 'LD'
          ? `document.body.innerText.includes('LED_Output') && document.querySelectorAll('svg').length > 8 ? true : undefined`
          : `document.querySelectorAll('.zplc-visual-editor .react-flow__node').length > 1 ? true : undefined`,
    )) === true
      ? true
      : undefined,
  );
  if (text) {
    // The example opens with a comment block: show the program, not the licence-like header.
    const { MONACO_MODULE } = await import('./run-desktop-smoke');
    await cdp.evaluate(
      `(async () => { const monaco = await ${MONACO_MODULE}; const editor = monaco.editor.getEditors()[0]; const line = ` +
        `editor.getModel().getValue().split('\\n').findIndex((row) => /^PROGRAM /.test(row)) + 1; editor.setScrollTop(0); ` +
        `editor.revealLineNearTop(line); })()`,
    );
  }
  await cdp.evaluate('document.fonts.ready.then(() => true)');
  await Bun.sleep(1_200); // the fit-view animation of the diagrams and the 200 ms theme transition
  await cdp.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
}

async function main(): Promise<void> {
  const folder = process.argv[2];
  assert(folder, 'usage: bun run scripts/capture-editor-shots.ts <folder>');
  mkdirSync(folder, { recursive: true });
  const cache = process.env.TMPDIR ?? join(process.env.HOME ?? '.', '.cache', 'zplc-doc-shots');
  mkdirSync(cache, { recursive: true });
  const scratch = mkdtempSync(join(cache, 'editor-shots-'));
  let vite: ReturnType<typeof Bun.spawn> | undefined;
  let browser: ReturnType<typeof Bun.spawn> | undefined;
  let cdp: Cdp | undefined;
  try {
    const vitePort = await freePort();
    vite = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(vitePort), '--strictPort'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await waitFor('Vite', async () => ((await fetch(`http://${HOST}:${vitePort}/`).catch(() => null))?.ok ? true : undefined));
    const url = `http://${HOST}:${vitePort}/`;
    const profile = join(scratch, 'profile');
    browser = Bun.spawn(
      [
        chromium(),
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--headless=new',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--lang=en-US',
        url,
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    const debugPort = await waitFor('Chromium DevTools port', () => {
      const active = join(profile, 'DevToolsActivePort');
      if (!existsSync(active)) return undefined;
      const port = Number(readFileSync(active, 'utf8').split(/\r?\n/, 1)[0]);
      return Number.isInteger(port) && port > 0 ? port : undefined;
    });
    const target = await waitFor('Chromium page', async () => {
      const targets = await fetch(`http://${HOST}:${debugPort}/json/list`).then(
        (response) => response.json() as Promise<Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>>,
      );
      return targets.find((item) => item.type === 'page' && item.url === url && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    });
    cdp = await Cdp.connect(target);
    await cdp.command('Runtime.enable');
    await cdp.command('Page.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await waitFor('the renderer', async () =>
      (await cdp!.evaluate(`document.readyState === 'complete' && document.querySelectorAll('button').length > 0 ? true : undefined`)) ===
      true
        ? true
        : undefined,
    );
    for (const locale of LOCALES)
      for (const example of EXAMPLES)
        for (const theme of THEMES) {
          // The first load of a lazy editor can make Vite re-optimise its dependencies and reload the page, which drops the seeded
          // state: seed again (the second time the dependencies are known).
          for (let attempt = 1; ; attempt++) {
            try {
              await show(cdp, example, locale, theme);
              break;
            } catch (error) {
              if (attempt === 3) throw new Error(`${String(error)}${cdp.errors.length ? `; ${cdp.errors.slice(0, 2).join(' | ')}` : ''}`);
            }
          }
          // Under load an animation (the fit-view of a diagram, a theme transition) can still be running: take the picture when two
          // consecutive ones are the same.
          let previous = '';
          let data = '';
          for (let attempt = 0; (attempt < 30 && data !== previous) || attempt === 0; attempt++) {
            previous = data;
            await Bun.sleep(400);
            data =
              ((await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })) as { data?: string }).data ??
              '';
          }
          assert(data.length > 0 && data === previous, `the window of ${example.language} in ${locale} (${theme}) did not settle`);
          writeFileSync(join(folder, `${example.language}-${locale}${theme === 'dark' ? '-dark' : ''}.png`), Buffer.from(data, 'base64'));
        }
  } finally {
    cdp?.close();
    await stop(browser);
    await stop(vite);
    rmSync(scratch, { recursive: true, force: true });
  }
}

await main();
