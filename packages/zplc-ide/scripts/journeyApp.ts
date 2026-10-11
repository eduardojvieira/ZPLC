/**
 * The app under test for the journeys (VF-008): a real Electron development host on a private user-data directory, driven
 * only by input events over the DevTools protocol (mouse, wheel, keyboard, text insertion). The native folder dialog is
 * answered by the main-process hook that exists only when the app is not packaged. Native POSIX only, never HIL.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trustedDevelopmentRendererUrl } from '../electron/security';
import { assert, assertSmokePortAvailable, Cdp, drain, freePort, HOST, packageRoot, preflight, smokeVitePort, stop, waitFor, type OwnedProcess } from './run-desktop-smoke';

export class NotPossible extends Error {}
/** A journey that cannot be performed because the product has no way to do it. */
export const notPossible = (reason: string): never => { throw new NotPossible(reason); };

/** A JavaScript expression, evaluated in the page, that yields the element a user would aim at (or null). */
export type Target = string;
const names = (label: string, mode: 'exact' | 'prefix' | 'contains') => `[el.getAttribute('aria-label'), el.textContent?.trim()].some((text) => text !== undefined && text !== null && ${mode === 'exact' ? `text === ${JSON.stringify(label)}` : mode === 'prefix' ? `text.startsWith(${JSON.stringify(label)})` : `text.includes(${JSON.stringify(label)})`})`;
const query = (selector: string, label: string, mode: 'exact' | 'prefix' | 'contains') => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => ${names(label, mode)})`;
export const button = (label: string, mode: 'exact' | 'prefix' | 'contains' = 'exact'): Target => query('button', label, mode);
export const tab = (label: string, mode: 'exact' | 'prefix' | 'contains' = 'prefix'): Target => query('[role="tab"]', label, mode);
export const menuItem = (label: string): Target => query('[role="menuitem"]', label, 'prefix');
export const css = (selector: string): Target => `document.querySelector(${JSON.stringify(selector)})`;

/** Where the user would aim at an element: its centre, once it is enabled, on screen and not covered by something else. */
const centre = (target: Target) => `(() => { const el = ${target}; if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const box = el.getBoundingClientRect(); if (box.width === 0 || box.height === 0) return null; const x = box.x + box.width / 2; const y = box.y + box.height / 2; const hit = document.elementFromPoint(x, y); return hit && (el === hit || el.contains(hit)) ? { x, y } : null; })()`;

const KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }, ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 }, Enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  F2: { key: 'F2', code: 'F2', keyCode: 113 }, F5: { key: 'F5', code: 'F5', keyCode: 116 }, F6: { key: 'F6', code: 'F6', keyCode: 117 },
  S: { key: 's', code: 'KeyS', keyCode: 83 }, B: { key: 'b', code: 'KeyB', keyCode: 66 }, Z: { key: 'z', code: 'KeyZ', keyCode: 90 },
  A: { key: 'a', code: 'KeyA', keyCode: 65 }, R: { key: 'r', code: 'KeyR', keyCode: 82 }, End: { key: 'End', code: 'End', keyCode: 35 }, Home: { key: 'Home', code: 'Home', keyCode: 36 },
};

export interface App {
  readonly cdp: Cdp;
  /** The folder the next native dialog "chooses" (null cancels it). */
  answer(folder: string | null): void;
  /** Main-process and renderer output, for evidence. */
  log(): string;
  eval<T = unknown>(expression: string): Promise<T>;
  /** Polls an observable condition until it yields a value (not undefined or false), or throws when `timeoutMs` (20 s by default) passes. */
  until<T>(description: string, check: () => Promise<T | undefined | false> | T | undefined | false, timeoutMs?: number): Promise<T>;
  /** A real mouse click (or double click) at the centre of the target. */
  click(target: Target, description?: string, clicks?: number): Promise<void>;
  /** A real right click at the centre of the target (the context menu of an item). */
  rightClick(target: Target, description?: string): Promise<void>;
  /** A real key chord such as `Ctrl+S` or `F5`, sent to whatever has focus. */
  press(chord: string): Promise<void>;
  /** Text inserted as the user would type or paste it, into whatever has focus. */
  type(text: string): Promise<void>;
  /** A real mouse click, and a real wheel turn, at page coordinates. */
  clickAt(x: number, y: number, clicks?: number): Promise<void>;
  wheel(x: number, y: number, deltaY: number): Promise<void>;
  visible(target: Target): Promise<boolean>;
  /** True when a user could click the target now: enabled, on screen, not covered. */
  clickable(target: Target): Promise<boolean>;
  text(): Promise<string>;
  /** Records a step the journey needed that a user should not need (shown in the table). */
  note(text: string): void;
  /** Renderer errors logged since the page settled. */
  readonly errors: string[];
  /** How many page targets (windows) the application has open now, from the DevTools endpoint. */
  pages(): Promise<number>;
}

async function mouse(cdp: Cdp, x: number, y: number, clicks = 1, button: 'left' | 'right' = 'left'): Promise<void> {
  const buttons = button === 'left' ? 1 : 2;
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (let clickCount = 1; clickCount <= clicks; clickCount++) {
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount });
  }
}

export interface Harness { vitePort: number; rendererUrl: string; runtime: string; output: string[] }

/** Process ids whose command line carries this exact `--user-data-dir`: the Electron main process and the helpers it started. */
function processesOfProfile(profile: string): number[] {
  if (process.platform !== 'linux') return [];
  const needle = `--user-data-dir=${profile}`;
  const found: number[] = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try { if (readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').includes(needle)) found.push(Number(name)); } catch { /* it exited meanwhile */ }
  }
  return found;
}

/**
 * Connects to a renderer target over the DevTools protocol and builds the `App` a journey drives: the same real clicks,
 * keys and text insertion for the development host and for a packaged application.
 */
async function connectApp(target: string, context: { answerFile: string | undefined; output: string[]; notes: string[]; cdpPort: number; connected(cdp: Cdp): void }): Promise<App> {
  const { answerFile, output, notes } = context;
  const page = await Cdp.connect(target);
  context.connected(page);
  const send = page.command.bind(page);
  page.command = (method, params) => send(method, params).catch((error: Error) => { throw new Error(`${method}${method.startsWith('Input.') ? ` ${JSON.stringify(params)}` : ''}: ${error.message}`); });
  for (const method of ['Runtime.enable', 'Log.enable', 'Page.enable', 'Page.bringToFront']) await page.command(method);
  await page.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  // The window asks for 1440x900 (electron/main.ts) but the private display is smaller; lay the page out at the size the app asks for.
  await page.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const evaluate = <T,>(expression: string) => page.evaluate(expression) as Promise<T>;
  const until: App['until'] = async (description, check, timeoutMs = 20_000) => {
    const started = Date.now(); let last: unknown;
    while (Date.now() - started < timeoutMs) {
      try { const value = await check(); if (value !== undefined && value !== false) { if (process.env.ZPLC_JOURNEY_TRACE && Date.now() - started > 1_000) console.log(`  slow wait ${Date.now() - started} ms: ${description}`); return value; } } catch (error) { last = error; }
      await Bun.sleep(100);
    }
    throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`);
  };
  await until('real preload bridge and Welcome screen', async () => await evaluate<boolean>(`Boolean(window.electronAPI?.isElectron && document.body.innerText.includes('ZPLC Studio 2.0'))`) || undefined);
  page.errors.splice(0); page.errorDetails.splice(0); // the headless bootstrap diagnostics are asserted by run-desktop-smoke.ts
  const app: App = {
    cdp: page,
    answer: (folder) => { if (answerFile === undefined) throw new Error('A packaged application has no folder dialog hook'); writeFileSync(answerFile, folder ?? ''); },
    log: () => `${output.join('')}\nrenderer errors: ${page.errorDetails.join(' | ')}`,
    eval: evaluate,
    until,
    click: async (target, description = target.slice(0, 120), clicks = 1) => {
      const point = await until(`${description} to be clickable`, async () => await evaluate<{ x: number; y: number } | null>(centre(target)) ?? undefined);
      assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${description} has no usable click point: ${JSON.stringify(point)}`);
      await mouse(page, point.x, point.y, clicks);
    },
    rightClick: async (target, description = target.slice(0, 120)) => {
      const point = await until(`${description} to be clickable`, async () => await evaluate<{ x: number; y: number } | null>(centre(target)) ?? undefined);
      await mouse(page, point.x, point.y, 1, 'right');
    },
    press: async (chord) => {
      const parts = chord.split('+'); const name = parts.pop()!; const definition = KEYS[name.length === 1 ? name.toUpperCase() : name];
      assert(definition, `Unknown key ${chord}`);
      const modifiers = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0);
      const text = definition.key === 'Enter' ? '\r' : undefined;
      await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: definition.key, code: definition.code, text, unmodifiedText: text, windowsVirtualKeyCode: definition.keyCode, modifiers });
      await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: definition.key, code: definition.code, windowsVirtualKeyCode: definition.keyCode, modifiers });
    },
    type: async (text) => { await page.command('Input.insertText', { text }); },
    clickAt: (x, y, clicks) => mouse(page, x, y, clicks),
    wheel: async (x, y, deltaY) => { await page.command('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }); },
    note: (text) => { if (!notes.includes(text)) notes.push(text); },
    clickable: async (target) => await evaluate<unknown>(centre(target)) !== null,
    visible: async (target) => await evaluate<boolean>(`(() => { const el = ${target}; if (!el) return false; const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; })()`),
    text: () => evaluate<string>('document.body.innerText'),
    errors: page.errors,
    pages: async () => (await fetch(`http://${HOST}:${context.cdpPort}/json/list`).then((response) => response.json() as Promise<Array<{ type?: string }>>).catch(() => [])).filter((item) => item.type === 'page').length,
  };
  return app;
}

export async function launchApp(harness: Harness, root: string): Promise<{ app: App; notes: string[]; stop(): Promise<void>; crash(): Promise<void> }> {
  const notes: string[] = [];
  const answerFile = join(root, 'folder-answer.txt'); writeFileSync(answerFile, '');
  const cdpPort = await freePort();
  const electronPath = join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  const output: string[] = [];
  const electron: OwnedProcess = Bun.spawn([electronPath, '--headless', '--disable-gpu', `--zplc-smoke-port=${harness.vitePort}`, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(root, 'profile')}`, '.'], {
    cwd: packageRoot, stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, NODE_ENV: 'development', ZPLC_NATIVE_SIM_BIN: harness.runtime, ZPLC_PERSIST_ROOT: join(root, 'persist'), ZPLC_SMOKE_FOLDER_ANSWER_FILE: answerFile },
  });
  drain(electron, output, 'electron');
  let cdp: Cdp | undefined;
  // Browser.close is not awaited: with unsaved changes the app answers it with a prompt, not a reply.
  const dispose = async () => { if (cdp) void cdp.command('Browser.close').catch(() => undefined); await Promise.race([electron.exited, Bun.sleep(3_000)]); cdp?.close(); await stop(electron); };
  // A crash: SIGKILL on the process this runner started, no shutdown of any kind. Its helpers follow it; any that stay are ours by profile.
  const crash = async () => {
    electron.kill('SIGKILL');
    await electron.exited;
    cdp?.close();
    for (let attempt = 0; attempt < 50 && processesOfProfile(join(root, 'profile')).length > 0; attempt++) {
      if (attempt >= 10) for (const pid of processesOfProfile(join(root, 'profile'))) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      await Bun.sleep(100);
    }
  };
  try {
    const target = await waitFor('real Electron renderer target', async () => {
      const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()).catch(() => [] as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>);
      return targets.find((item: { type?: string; url?: string; webSocketDebuggerUrl?: string }) => item.type === 'page' && item.url === harness.rendererUrl && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl as string | undefined;
    });
    const app = await connectApp(target, { answerFile, output, notes, cdpPort, connected: (page) => { cdp = page; } });
    return { app, notes, stop: dispose, crash };
  } catch (error) {
    await dispose();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-4_000)}`);
  }
}


/**
 * The packaged application, unpacked by electron-builder (`dist-electron/linux-unpacked/zplc-ide`), on a private user-data
 * directory. It has no folder dialog hook (the hook is not in its archive), so a project is reached through the recent
 * projects that the user-data directory holds: `recent` lists folders to put there before it starts, the way a person who
 * chose them earlier would have. Native POSIX only, never HIL.
 */
export async function launchPackagedApp(executable: string, root: string, recent: string[] = []): Promise<{ app: App; pid: number; stop(): Promise<void>; processes(): number[] }> {
  const notes: string[] = [];
  const profile = join(root, 'profile');
  if (recent.length > 0) {
    mkdirSync(profile, { recursive: true });
    const projects = recent.map((path, index) => ({ id: createHash('sha256').update(path, 'utf8').digest('hex'), path, lastOpenedAt: Date.now() - index }));
    writeFileSync(join(profile, 'zplc-recent-projects.v1.json'), JSON.stringify({ schemaVersion: 1, projects }));
  }
  const cdpPort = await freePort();
  const output: string[] = [];
  const env = { ...process.env };
  for (const name of ['ZPLC_NATIVE_SIM_BIN', 'ZPLC_SMOKE_FOLDER_ANSWER_FILE', 'ZPLC_PERSIST_ROOT', 'NODE_ENV']) delete env[name];
  const electron: OwnedProcess = Bun.spawn([executable, '--headless', '--disable-gpu', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`], { stdout: 'pipe', stderr: 'pipe', env });
  drain(electron, output, 'electron');
  let cdp: Cdp | undefined;
  const stopApp = async () => { if (cdp) void cdp.command('Browser.close').catch(() => undefined); await Promise.race([electron.exited, Bun.sleep(3_000)]); cdp?.close(); await stop(electron); };
  try {
    const target = await waitFor('packaged file renderer target', async () => {
      const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()).catch(() => [] as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>);
      return targets.find((item: { type?: string; url?: string; webSocketDebuggerUrl?: string }) => item.type === 'page' && item.url?.startsWith('file:') && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl as string | undefined;
    });
    const app = await connectApp(target, { answerFile: undefined, output, notes, cdpPort, connected: (page) => { cdp = page; } });
    return { app, pid: electron.pid, stop: stopApp, processes: () => processesOfProfile(profile) };
  } catch (error) {
    await stopApp();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-4_000)}`);
  }
}

/** One Vite server for the whole run; every journey launches its own Electron against it. */
export async function startHarness(): Promise<{ harness: Harness; scratch: string; stop(): Promise<void> }> {
  const runtime = preflight(); const vitePort = smokeVitePort();
  const scratch = mkdtempSync(join(tmpdir(), 'zplc-journeys-'));
  await assertSmokePortAvailable(vitePort);
  const vite: OwnedProcess = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(vitePort), '--strictPort'], { cwd: packageRoot, stdout: 'pipe', stderr: 'pipe' });
  const output: string[] = []; drain(vite, output, 'vite');
  const dispose = async () => { await stop(vite); rmSync(scratch, { recursive: true, force: true }); };
  try {
    await waitFor('Vite at the owned trusted origin', async () => (await fetch(`http://${HOST}:${vitePort}/`).catch(() => null))?.ok ? true : undefined);
  } catch (error) { await dispose(); throw error; }
  return { harness: { vitePort, rendererUrl: trustedDevelopmentRendererUrl(vitePort), runtime, output }, scratch, stop: dispose };
}
