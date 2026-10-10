/** Real Electron development-host smoke; native POSIX only, never HIL. */
import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isElectronHeadlessBootstrapQuarantine } from './electronHeadlessQuarantine';
import { DEFAULT_DEVELOPMENT_RENDERER_PORT, parseTrustedDevelopmentRendererPort, trustedDevelopmentRendererUrl } from '../electron/security';

const HOST = '127.0.0.1';
const TIMEOUT_MS = 20_000;
const packageRoot = join(import.meta.dir, '..');
type OwnedProcess = ReturnType<typeof Bun.spawn>;

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function executable(path: string | undefined): string | undefined { try { if (path) { accessSync(path, constants.X_OK); return path; } } catch { return undefined; } return undefined; }
function required(path: string): void { assert(existsSync(path), `Required Electron artifact is missing: ${path}. Run bun run electron:compile first.`); }
function preflight(): string {
  const runtime = executable(process.env.ZPLC_NATIVE_SIM_BIN);
  assert(runtime, 'ZPLC_NATIVE_SIM_BIN must name an executable native POSIX runtime. This smoke never builds it implicitly.');
  required(join(packageRoot, 'electron-dist', 'main.js')); required(join(packageRoot, 'electron-dist', 'preload.cjs')); required(join(packageRoot, 'electron-dist', 'toolApi.js'));
  assert(executable(join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')), 'Installed Electron executable is missing. Run bun install first.');
  return runtime;
}
function smokeVitePort(): number {
  const value = process.env.ZPLC_ELECTRON_SMOKE_PORT;
  if (value === undefined) return DEFAULT_DEVELOPMENT_RENDERER_PORT;
  const port = parseTrustedDevelopmentRendererPort(value);
  assert(port !== null, 'ZPLC_ELECTRON_SMOKE_PORT must be a canonical TCP port from 1024 through 65535.');
  return port;
}
async function freePort(): Promise<number> { return await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, HOST, () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0)); }); }); }
async function assertSmokePortAvailable(port: number): Promise<void> { await new Promise<void>((resolve, reject) => { const server = createServer(); server.once('error', () => reject(new Error(`Vite smoke port ${HOST}:${port} is already in use; refusing to use another process.`))); server.listen(port, HOST, () => server.close((error) => error ? reject(error) : resolve())); }); }
async function waitFor<T>(description: string, check: () => Promise<T | undefined> | T | undefined): Promise<T> { const deadline = Date.now() + TIMEOUT_MS; let last: unknown; while (Date.now() < deadline) { try { const value = await check(); if (value !== undefined) return value; } catch (error) { last = error; } await Bun.sleep(100); } throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`); }
async function stop(process: OwnedProcess | undefined): Promise<void> { if (!process || process.exitCode !== null) return; process.kill('SIGTERM'); await Promise.race([process.exited, Bun.sleep(3_000)]); if (process.exitCode === null) { process.kill('SIGKILL'); await process.exited; } }
function drain(process: OwnedProcess, output: string[], label: string): void { const append = (chunk: Uint8Array) => { output.push(`${label}: ${new TextDecoder().decode(chunk)}`); while (output.join('').length > 12_000) output.shift(); }; for (const stream of [process.stdout, process.stderr]) { if (stream && typeof stream === 'object') void (async () => { for await (const chunk of stream) append(chunk); })(); } }

class Cdp {
  #socket: WebSocket; #id = 1; #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  readonly errors: string[] = [];
  readonly errorDetails: string[] = [];
  #contexts = new Map<number, string>();
  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: { executionContextId?: number; exceptionDetails?: { text?: string; exception?: { description?: string }; executionContextId?: number; stackTrace?: { callFrames?: Array<{ url?: string; functionName?: string; lineNumber?: number; columnNumber?: number }> } }; entry?: { level?: string; text?: string; url?: string; lineNumber?: number }; type?: string; args?: Array<{ value?: unknown; description?: string }>; stackTrace?: { callFrames?: Array<{ url?: string; functionName?: string; lineNumber?: number; columnNumber?: number }> }; context?: { id?: number; origin?: string; name?: string; auxData?: { type?: string; frameId?: string; isDefault?: boolean } } } };
      if (message.id) { const pending = this.#pending.get(message.id); if (!pending) return; this.#pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed')); else pending.resolve(message.result); return; }
      if (message.method === 'Runtime.executionContextCreated') { const context = message.params?.context; if (context?.id !== undefined) this.#contexts.set(context.id, JSON.stringify({ id: context.id, origin: context.origin, name: context.name, ...context.auxData })); return; }
      const human = message.method === 'Runtime.exceptionThrown' ? message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Runtime exception' : message.method === 'Log.entryAdded' ? message.params?.entry?.text ?? 'Browser log error' : message.params?.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') || 'console.error';
      const isError = message.method === 'Runtime.exceptionThrown' || (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') || (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error');
      if (!isError) return;
      this.errors.push(human);
      const contextId = message.params?.executionContextId ?? message.params?.exceptionDetails?.executionContextId;
      const frames = message.params?.stackTrace?.callFrames ?? message.params?.exceptionDetails?.stackTrace?.callFrames ?? [];
      this.errorDetails.push(JSON.stringify({ method: message.method, human, context: contextId === undefined ? undefined : this.#contexts.get(contextId), source: message.params?.entry?.url, line: message.params?.entry?.lineNumber, stack: frames.slice(0, 3) }));
    });
    const reject = () => { for (const pending of this.#pending.values()) pending.reject(new Error('CDP WebSocket closed')); this.#pending.clear(); };
    socket.addEventListener('close', reject); socket.addEventListener('error', reject);
  }
  static async connect(url: string): Promise<Cdp> { const socket = new WebSocket(url); await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true }); }); return new Cdp(socket); }
  async command(method: string, params: Record<string, unknown> = {}): Promise<unknown> { const id = this.#id++; const response = new Promise<unknown>((resolve, reject) => { const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, TIMEOUT_MS); this.#pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } }); }); this.#socket.send(JSON.stringify({ id, method, params })); return await response; }
  async evaluate(expression: string): Promise<unknown> { const response = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }; if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Page evaluation failed'); return response.result?.value; }
  close(): void { this.#socket.close(); }
}

function click(text: string): string { return `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(${JSON.stringify(text)})); if (!button || button.disabled) return false; button.click(); return true; })()`; }
async function press(cdp: Cdp, key: string, code = key): Promise<void> {
  const keyCode = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40 }[key] ?? 0;
  const text = key === 'Enter' ? '\r' : undefined;
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: keyCode });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
}
const storeEval = (cdp: Cdp, body: string): Promise<unknown> => cdp.evaluate(`import('/src/store/useIDEStore.ts').then(async ({ useIDEStore }) => { const state = () => useIDEStore.getState(); ${body} })`);
const fileContent = (cdp: Cdp, id: string) => storeEval(cdp, `return state().loadedFiles.get(${JSON.stringify(id)})?.content;`) as Promise<string | undefined>;
/** Runs `body` with the page's own Monaco module instance, its first editor and its models in scope. */
const monacoEval = (cdp: Cdp, body: string): Promise<unknown> => cdp.evaluate(`(async () => { const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\\/monaco-editor\\.js/.test(name)); const monaco = await import(url); const editor = monaco.editor.getEditors()[0]; ${body} })()`);
async function showFile(cdp: Cdp, id: string): Promise<void> {
  assert(await cdp.evaluate(`(() => { const tab = document.getElementById(${JSON.stringify(`editor-tab-${id}`)}); if (!tab) return false; tab.click(); return true; })()`) === true, `Editor tab for ${id} is missing.`);
  await waitFor(`editor showing ${id}`, async () => {
    const expected = await fileContent(cdp, id);
    const active = await storeEval(cdp, `return state().activeFileId;`);
    return active === id && await monacoEval(cdp, 'return editor?.getModel()?.getValue();') === expected ? true : undefined;
  });
}
const dialogTitle = `document.querySelector('[data-unsaved-changes-dialog]')?.closest('[role="dialog"]')?.querySelector('h2')?.textContent ?? null`;
const dialogButton = (label: string) => `(() => { const dialog = document.querySelector('[data-unsaved-changes-dialog]'); const button = [...(dialog?.querySelectorAll('button') ?? [])].find((item) => item.textContent === ${JSON.stringify(label)}); if (!button || button.disabled) return false; button.click(); return true; })()`;
async function expectPrompt(cdp: Cdp, title: string): Promise<void> {
  await waitFor(`unsaved-changes prompt "${title}"`, async () => await cdp.evaluate(dialogTitle) === title ? true : undefined);
}
async function answerPrompt(cdp: Cdp, label: string): Promise<void> {
  assert(await cdp.evaluate(dialogButton(label)) === true, `The unsaved-changes prompt has no enabled "${label}" button.`);
}
async function promptGone(cdp: Cdp): Promise<void> {
  await waitFor('unsaved-changes prompt to close', async () => await cdp.evaluate(dialogTitle) === null ? true : undefined);
}
const card = `(() => { const panel = document.querySelector('[aria-label="Live native POSIX motor"]'); if (!panel) return null; const text = panel.textContent ?? ''; const get = (name) => Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === name)?.disabled; return { text, cycles: Number((text.match(/·\\s*(\\d+) cycles/) ?? [])[1]), startDisabled: get('Start'), stopDisabled: get('Stop'), assertDisabled: get('Assert E-stop'), releaseDisabled: get('Release E-stop') }; })()`;

async function main(): Promise<void> {
  const runtime = preflight(); const vitePort = smokeVitePort(); const rendererUrl = trustedDevelopmentRendererUrl(vitePort); const tempRoot = mkdtempSync(join(tmpdir(), 'zplc-electron-smoke-')); const output: string[] = [];
  let vite: OwnedProcess | undefined; let electron: OwnedProcess | undefined; let cdp: Cdp | undefined;
  try {
    const scenarioWorkspace = join(tempRoot, 'motor-start-stop');
    // The development-only test hook answers the native folder dialog from this file (empty means cancel); a packaged build ignores it.
    const folderAnswerFile = join(tempRoot, 'folder-answer.txt'); writeFileSync(folderAnswerFile, '');
    cpSync(join(packageRoot, 'projects', 'motor_start_stop'), scenarioWorkspace, { recursive: true });
    const cdpPort = await freePort();
    await assertSmokePortAvailable(vitePort);
    vite = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(vitePort), '--strictPort'], { cwd: packageRoot, stdout: 'pipe', stderr: 'pipe' }); drain(vite, output, 'vite');
    await waitFor('Vite at the owned trusted origin', async () => (await fetch(`http://${HOST}:${vitePort}/`).catch(() => null))?.ok ? true : undefined); assert(vite.exitCode === null, `Vite exited before Electron could use ${rendererUrl} (the port may be occupied).`);
    const electronPath = join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
    electron = Bun.spawn([electronPath, '--headless', '--disable-gpu', `--zplc-smoke-port=${vitePort}`, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(tempRoot, 'profile')}`, '.'], { cwd: packageRoot, env: { ...process.env, NODE_ENV: 'development', ZPLC_NATIVE_SIM_BIN: runtime, ZPLC_PERSIST_ROOT: join(tempRoot, 'persist'), ZPLC_SMOKE_FOLDER_ANSWER_FILE: folderAnswerFile }, stdout: 'pipe', stderr: 'pipe' }); drain(electron, output, 'electron');
    let targetSummary = '';
    const target = await waitFor('real Electron renderer target', async () => { const targets: Array<{ type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string }> = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json() as Promise<Array<{ type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string }>>).catch(() => []); targetSummary = JSON.stringify(targets.map(({ type, url, title }) => ({ type, url, title }))); return targets.find((item) => item.type === 'page' && item.url === rendererUrl && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl; });
    cdp = await Cdp.connect(target); await cdp.command('Runtime.enable'); await cdp.command('Log.enable'); await cdp.command('Page.enable'); await cdp.command('Page.bringToFront'); await cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    const bridge = await waitFor('real preload bridge', async () => { const value = await cdp!.evaluate('({ href: location.href, bridge: Boolean(window.electronAPI?.isElectron && window.electronAPI.nativeSimulation), keys: Object.keys(window).filter((key) => key.toLowerCase().includes("electron")) })') as { bridge?: unknown }; return value.bridge === true ? value : undefined; }).catch((error: unknown) => { throw new Error(`${error instanceof Error ? error.message : String(error)} targets=${targetSummary}`); });
    assert((bridge as { bridge?: unknown }).bridge === true, `The real preload bridge is unavailable: ${JSON.stringify(bridge)} targets=${targetSummary}`);
    const appInfo = await cdp.evaluate('window.electronAPI.getAppInfo()');
    const menuReport = output.join('').split('\n').find((line) => line.includes('[zplc] application menu'));
    const menuAccelerators = /accelerators=(\S*)/.exec(menuReport ?? '')?.[1].split(',') ?? [];
    assert(menuReport?.includes('toggledevtools') && menuAccelerators.includes('CmdOrCtrl+R') && menuAccelerators.includes('CmdOrCtrl+Shift+R'), `The development menu should keep its guarded reload entries: ${menuReport}`);
    // UX-016: the window is hidden until the page has painted, is titled with the product name and carries the theme's canvas colour.
    const windowReport = await waitFor('window report from the main process', () => output.join('').split('\n').find((line) => line.includes('[zplc] window title=')));
    const reported = /title="([^"]*)" background=(#[0-9a-fA-F]{6})\w* visibleBeforeReveal=(\w+)/.exec(windowReport);
    assert(reported?.[1] === 'ZPLC Studio' && reported[3] === 'false', `The window must be titled "ZPLC Studio" and hidden until ready-to-show: ${windowReport}`);
    const rendererSurface = String(await cdp.evaluate('getComputedStyle(document.documentElement).backgroundColor'));
    const surfaceHex = `#${(/rgb\((\d+), (\d+), (\d+)\)/.exec(rendererSurface) ?? []).slice(1).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
    assert(surfaceHex === reported[2].toLowerCase(), `The native window colour ${reported[2]} must equal the theme canvas ${rendererSurface}.`);
    assert(await cdp.evaluate('document.title') === 'ZPLC Studio', 'The page title must be "ZPLC Studio".');
    console.log(`Window set-up observed: ${windowReport.replace('[zplc] ', '')}; renderer canvas ${rendererSurface}`);
    const frame = await cdp.command('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
    const mainFrameId = frame.frameTree?.frame?.id ?? '';
    const electronVersion = JSON.parse(readFileSync(join(packageRoot, 'node_modules', 'electron', 'package.json'), 'utf8')).version as string;
    // Electron 43.4.1 headless/CDP bootstrap quarantine; remove when Electron changes.
    assert(isElectronHeadlessBootstrapQuarantine(electronVersion, cdp.errorDetails, mainFrameId), `Unexpected initial CDP diagnostics: ${cdp.errorDetails.join(' | ')}`);
    cdp.errors.splice(0); cdp.errorDetails.splice(0);
    let rendererText = '';
    await waitFor('Motor Start Stop example', async () => { rendererText = String(await cdp!.evaluate('document.body.innerText')); return rendererText.includes('Motor Start Stop') ? true : undefined; }).catch((error: unknown) => { throw new Error(`${error instanceof Error ? error.message : String(error)} renderer=${rendererText.slice(0, 1_000)}`); });
    assert(await cdp.evaluate(`(() => { const control = document.querySelector('select[data-theme-control]'); control?.focus(); const style = control ? getComputedStyle(control) : null; return Boolean(control && document.activeElement === control && control.matches(':focus-visible') && style?.outlineStyle !== 'none'); })()`), 'Welcome theme control does not expose a visible keyboard focus state.');
    // UX-005: one global ring, so a control that opts out with focus:outline-none still shows a non-zero outline.
    const optOut = await cdp.evaluate(`(() => { const input = document.createElement('input'); input.className = 'focus:outline-none'; document.body.append(input); input.focus(); const style = getComputedStyle(input); const result = { utilityLoaded: [...document.querySelectorAll('style')].some((sheet) => sheet.textContent?.includes('focus\\\\:outline-none')), focusVisible: input.matches(':focus-visible'), style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor }; input.remove(); return result; })()`) as { utilityLoaded: boolean; focusVisible: boolean; style: string; width: number; color: string };
    assert(optOut.utilityLoaded && optOut.focusVisible && optOut.style === 'solid' && optOut.width > 0 && optOut.color !== 'rgba(0, 0, 0, 0)', `A control with focus:outline-none must still show the global focus ring: ${JSON.stringify(optOut)}`);
    assert(await cdp.evaluate(`(() => { const select = document.querySelector('select[data-theme-control]'); select.value = 'dark'; select.dispatchEvent(new Event('change', { bubbles: true })); return document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor === 'rgb(15, 23, 27)'; })()`), 'Explicit dark theme did not apply its authored surface.');
    // UX-024: text-white on a solid accent fill takes the theme's on-accent colour, so the dark theme's light accents stay legible.
    assert(await cdp.evaluate(`(() => { const probe = document.createElement('button'); probe.className = 'bg-[var(--color-accent-blue)] text-white'; document.body.append(probe); const style = getComputedStyle(probe); const ok = document.documentElement.classList.contains('dark') && style.color === 'rgb(15, 23, 27)' && style.backgroundColor === 'rgb(91, 167, 223)'; probe.remove(); return ok; })()`), 'Dark theme: text on a solid accent fill must use the on-accent colour.');
    assert(await cdp.evaluate(`(() => { const select = document.querySelector('select[data-theme-control]'); select.value = 'high-contrast'; select.dispatchEvent(new Event('change', { bubbles: true })); return document.documentElement.classList.contains('high-contrast') && getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)'; })()`), 'Explicit high-contrast theme did not apply its authored surface.');
    assert(await cdp.evaluate(`(() => { const select = document.querySelector('select[data-theme-control]'); select.value = 'light'; select.dispatchEvent(new Event('change', { bubbles: true })); return document.documentElement.classList.contains('light') && getComputedStyle(document.body).backgroundColor === 'rgb(231, 236, 232)'; })()`), 'Explicit light theme did not restore its authored surface.');
    await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reducedMotion = await cdp.evaluate(`(() => { const control = document.querySelector('select[data-theme-control]'); const style = control ? getComputedStyle(control) : null; return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, duration: style?.transitionDuration, ok: Boolean(style?.transitionDuration.split(',').every((value) => Number.parseFloat(value) <= 0.01)) }; })()`) as { matches: boolean; duration?: string; ok: boolean };
    assert(reducedMotion.matches && reducedMotion.ok, `Reduced-motion media did not suppress welcome control transitions: ${JSON.stringify(reducedMotion)}.`);
    await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    assert(await cdp.evaluate(`(() => { const control = document.querySelector('select[data-theme-control]'); control?.focus(); const style = control ? getComputedStyle(control) : null; return Boolean(matchMedia('(forced-colors: active)').matches && control?.matches(':focus-visible') && style?.outlineStyle !== 'none' && style?.outlineColor !== 'rgba(0, 0, 0, 0)'); })()`), 'Forced-colors media did not preserve a visible keyboard focus outline.');
    await cdp.command('Emulation.setEmulatedMedia', { features: [] });
    // IDE-001, IDE-003 (T7.5): the folder is chosen by the native dialog of the main process, answered here by the development-only
    // hook. The renderer must never open a browser picker, so the file system permission is never requested (the handlers stay deny-by-default).
    await cdp.evaluate(`(() => { window.__zplcSmokePickerCalls = 0; Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => { window.__zplcSmokePickerCalls += 1; throw new DOMException('picker', 'AbortError'); } }); })()`);
    const answerDialog = (folder: string | null) => writeFileSync(folderAnswerFile, folder ?? '');
    const clickOpenProject = async (when: string) => assert(await cdp!.evaluate(click('Open project')) === true, `Open project is not actionable ${when}.`);
    const welcomeVisible = `[...document.querySelectorAll('button')].some((item) => item.textContent?.includes('Open project'))`;
    // A folder that cannot be used is explained on the screen where the action started, without its path.
    answerDialog(join(tempRoot, 'no-such-folder'));
    await clickOpenProject('on the Welcome screen');
    const welcomeFailure = await waitFor('Welcome open error', async () => { const text = String(await cdp!.evaluate(`document.querySelector('[role="alert"][data-open-error]')?.textContent ?? ''`)); return text.includes('was not found') ? text : undefined; });
    assert(!welcomeFailure.includes(tempRoot) && !welcomeFailure.includes('no-such-folder'), `The Welcome error must not show a path: ${welcomeFailure}`);
    // A cancelled dialog returns nothing and clears the message.
    answerDialog(null);
    await clickOpenProject('after a failed attempt');
    await waitFor('Welcome open error cleared by a cancelled dialog', async () => await cdp!.evaluate(`document.querySelector('[data-open-error]') === null`) === true ? true : undefined);
    // The permission handlers stay deny-by-default: a request other than serial is refused (the file system permission goes through the same handlers).
    const permissionProbe = await cdp.evaluate(`Notification.requestPermission().then((requested) => ({ requested, now: Notification.permission }))`) as { requested: string; now: string };
    assert(permissionProbe.requested === 'denied' && permissionProbe.now === 'denied', `A permission request must be refused: ${JSON.stringify(permissionProbe)}`);
    // Journey: open a folder, edit a file, save it, close the project, open the folder again and read the saved content back.
    const journeyFolder = join(tempRoot, 'journey-project');
    cpSync(join(packageRoot, 'projects', 'motor_start_stop'), journeyFolder, { recursive: true });
    const journeyFile = join(journeyFolder, 'src', 'Motor.st');
    const edited = `${readFileSync(journeyFile, 'utf8')}\n(* smoke edit: ñ 温度 *)\n`;
    answerDialog(journeyFolder);
    await clickOpenProject('to open the journey folder');
    await waitFor('journey project to open', async () => await storeEval(cdp!, `return state().isProjectOpen && state().directoryHandle?.name === 'journey-project' ? true : undefined;`) as true | undefined);
    assert(await storeEval(cdp, `await state().openFile('file:src/Motor.st'); state().updateFileContent('file:src/Motor.st', ${JSON.stringify(edited)}); return await state().saveFile('file:src/Motor.st');`) === true, 'Saving the edited file reported a failure.');
    assert(readFileSync(journeyFile, 'utf8') === edited, 'The saved file on disk is not the edited content.');
    assert(await storeEval(cdp, 'return state().closeProject();') === true, 'The saved project could not be closed.');
    await waitFor('Welcome screen after closing', async () => await cdp!.evaluate(welcomeVisible) === true ? true : undefined);
    answerDialog(journeyFolder);
    await clickOpenProject('to reopen the journey folder');
    await waitFor('journey project to reopen', async () => await storeEval(cdp!, `return state().isProjectOpen && state().directoryHandle?.name === 'journey-project' ? true : undefined;`) as true | undefined);
    assert(await storeEval(cdp, `await state().openFile('file:src/Motor.st'); return state().loadedFiles.get('file:src/Motor.st')?.content;`) === edited, 'The reopened project does not show the saved content.');
    assert(await storeEval(cdp, 'return state().closeProject();') === true, 'The reopened project could not be closed.');
    await waitFor('Welcome screen before the example copy', async () => await cdp!.evaluate(welcomeVisible) === true ? true : undefined);
    // The example copy writes into a real folder through the same dialog.
    const copiedFolder = join(tempRoot, 'copied-motor-start-stop'); mkdirSync(copiedFolder);
    answerDialog(copiedFolder);
    assert(await cdp.evaluate(click('Motor Start Stop')) === true, 'Motor Start Stop example button is not actionable.');
    const copiedExample = await waitFor('copied Motor Start Stop example', async () => await storeEval(cdp!, `return state().isProjectOpen && state().directoryHandle?.name === 'copied-motor-start-stop' ? { pickerCalls: window.__zplcSmokePickerCalls, migrationPreview: state().projectMigrationPreview, active: state().activeFileId } : undefined;`) as { pickerCalls: number; migrationPreview: unknown; active: string | null } | undefined);
    assert(copiedExample?.pickerCalls === 0 && copiedExample.migrationPreview === null && copiedExample.active === 'file:src/Motor.st' && existsSync(join(copiedFolder, 'tests', 'motor-start-stop.scenario.json')) && existsSync(join(copiedFolder, 'zplc.json')), `Example copy did not finish as one disk-backed session without a renderer picker: ${JSON.stringify(copiedExample)}`);
    // UX-017: the separator between the editor and the lower panel is visible, reachable, movable by keyboard and pointer, and remembered.
    const separatorState = `(() => { const el = document.querySelector('[role="separator"]'); const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--color-accent-blue)'; document.body.append(probe); const cobalt = getComputedStyle(probe).backgroundColor; probe.remove(); if (!el) return null; const box = el.getBoundingClientRect(); const saved = JSON.parse(localStorage.getItem('react-resizable-panels:zplc-ide-workspace') ?? 'null'); return { state: el.getAttribute('data-separator'), orientation: el.getAttribute('aria-orientation'), tabindex: el.getAttribute('tabindex'), label: el.getAttribute('aria-label'), now: Number(el.getAttribute('aria-valuenow')), height: box.height, x: box.x + box.width / 2, y: box.y + box.height / 2, background: getComputedStyle(el).backgroundColor, cobalt, saved, focused: document.activeElement === el }; })()`;
    type SeparatorState = { state: string; orientation: string; tabindex: string; label: string; now: number; height: number; x: number; y: number; background: string; cobalt: string; saved: { editor?: number; console?: number } | null; focused: boolean };
    const separator = async (): Promise<SeparatorState> => await cdp!.evaluate(separatorState) as SeparatorState;
    const before = await waitFor('workspace separator', async () => (await separator()) ?? undefined);
    assert(before.orientation === 'horizontal' && before.tabindex === '0' && before.label === 'Resize editor and lower panel' && before.height >= 4 && before.state === 'inactive' && before.background !== before.cobalt, `The workspace separator is not exposed as a visible, focusable 4px separator: ${JSON.stringify(before)}`);
    assert(await cdp.evaluate(`(() => { const el = document.querySelector('[role="separator"]'); el.focus(); return document.activeElement === el; })()`), 'The workspace separator cannot take keyboard focus.');
    await press(cdp, 'ArrowUp');
    const afterKey = await waitFor('separator moved by keyboard and turned cobalt', async () => { const now = await separator(); return now.now !== before.now && now.background === now.cobalt ? now : undefined; });
    assert(afterKey.state === 'focus' && afterKey.background === afterKey.cobalt && afterKey.saved?.editor !== undefined && Math.abs(afterKey.saved.editor - afterKey.now) < 0.5, `ArrowUp must move the focused separator and remember the layout: ${JSON.stringify({ before: before.now, afterKey })}`);
    assert(await cdp.evaluate(`(() => { const el = document.querySelector('[role="separator"]'); el.blur(); return document.activeElement !== el; })()`), 'The workspace separator did not release focus.');
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: afterKey.x, y: afterKey.y });
    await waitFor('separator hover state', async () => (await separator()).state === 'hover' ? true : undefined);
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: afterKey.x, y: afterKey.y, button: 'left', buttons: 1, clickCount: 1 });
    await waitFor('separator active state', async () => (await separator()).state === 'active' ? true : undefined);
    for (const dy of [-20, -40, -60]) await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: afterKey.x, y: afterKey.y + dy, button: 'left', buttons: 1 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: afterKey.x, y: afterKey.y - 60, button: 'left', buttons: 0, clickCount: 1 });
    const afterDrag = await waitFor('separator moved by pointer and layout saved', async () => { const now = await separator(); return now.now < afterKey.now - 1 && now.saved?.editor !== undefined && Math.abs(now.saved.editor - now.now) < 0.5 ? now : undefined; });
    console.log(`Separator observed: ${before.state} ${before.height}px, keyboard ${before.now.toFixed(1)} -> ${afterKey.now.toFixed(1)} (${afterKey.state}), pointer -> ${afterDrag.now.toFixed(1)}, saved ${JSON.stringify(afterDrag.saved)}`);
    await waitFor('Tests tab', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Tests,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    const documentRoot = await cdp.command('DOM.getDocument') as { root?: { nodeId?: number } };
    const manifestInputNode = await cdp.command('DOM.querySelector', { nodeId: documentRoot.root?.nodeId, selector: 'input[data-workspace-manifest-input]' }) as { nodeId?: number };
    assert(manifestInputNode.nodeId, 'The Tests tab does not expose its manifest file input.');
    // The manifest of the folder that the window shows: the main process refuses the zplc.json of any other folder (IDE-002).
    await cdp.command('DOM.setFileInputFiles', { files: [join(copiedFolder, 'zplc.json')], nodeId: manifestInputNode.nodeId });
    await cdp.evaluate('document.querySelector(\'input[data-workspace-manifest-input]\')?.dispatchEvent(new Event("change", { bubbles: true }))');
    await waitFor('ready host scenario action', async () => await cdp!.evaluate(`(() => { const run = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Run host scenarios')); return run && !run.disabled && document.body.innerText.includes('Linked saved workspace ready for host scenarios.') ? true : undefined; })()`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const toolbar = document.querySelector('[role="toolbar"][aria-label="Project operations"]'); const build = document.querySelector('button[aria-label="Build options"]'); const mode = document.querySelector('[role="group"][aria-label="Execution mode"]'); return Boolean(toolbar && build?.getAttribute('aria-controls') && build.getAttribute('aria-expanded') === 'false' && mode?.querySelector('button[aria-pressed="true"]')); })()`), 'Toolbar accessibility semantics are missing.');
    assert(await cdp.evaluate(`(() => { const build = document.querySelector('button[aria-label="Build options"]'); build?.focus(); return document.activeElement === build; })()`), 'Build trigger cannot receive focus.');
    await press(cdp, 'Enter');
    await waitFor('Build menu keyboard open', async () => await cdp!.evaluate(`(() => { const build = document.querySelector('button[aria-label="Build options"]'); const menu = document.getElementById(build?.getAttribute('aria-controls') ?? ''); return build?.getAttribute('aria-expanded') === 'true' && Boolean(menu) && document.activeElement === menu?.querySelector('button'); })()`) === true ? true : undefined);
    await press(cdp, 'Escape');
    await waitFor('Build menu keyboard close and focus return', async () => await cdp!.evaluate(`(() => { const build = document.querySelector('button[aria-label="Build options"]'); return build?.getAttribute('aria-expanded') === 'false' && document.activeElement === build; })()`) === true ? true : undefined);
    await press(cdp, 'Enter');
    await waitFor('Build menu compile item focus', async () => await cdp!.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Compile current project (Ctrl+B)' ? true : undefined`) === true ? true : undefined);
    await press(cdp, 'Enter');
    await waitFor('canonical saved workspace build', async () => await cdp!.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); return state.compilerMessagesChecked && state.consoleEntries.some((entry) => entry.message.startsWith('Built saved workspace locally:')) ? true : undefined; })`) === true ? true : undefined).catch(async (error: unknown) => { throw new Error(`${error instanceof Error ? error.message : String(error)} renderer=${String(await cdp!.evaluate('document.body.innerText')).slice(-2_000)}`); });
    await waitFor('Learn tab', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Learn,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const english = [...document.querySelectorAll('button')].find((item) => item.textContent === 'English'); english?.focus(); return document.activeElement === english && english.matches(':focus-visible'); })()`), 'Learn language selection is not keyboard focusable.');
    await press(cdp, 'Enter');
    const learnSelection = await waitFor('Learn keyboard selection', async () => await cdp!.evaluate(`(() => { const status = document.querySelector('[data-learn-grade]'); const text = document.body.innerText; const selected = [...document.querySelectorAll('button[aria-pressed="true"]')].map((item) => item.textContent); return status ? { grade: status.getAttribute('data-learn-grade'), text: text.slice(-1_000), selected } : undefined; })()`) as { grade: string | null; text: string; selected: string[] });
    assert(learnSelection.grade === 'not-run' && learnSelection.text.includes('Choose the saved zplc.json') && !learnSelection.text.includes('Host POSIX scenarios passed.') && learnSelection.selected.includes('English'), `Learn keyboard selection did not remain read-only: ${JSON.stringify(learnSelection)}`);
    await waitFor('Tests tab after Learn', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Tests,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const connect = document.querySelector('button[aria-label="Connect"]'); connect?.focus(); return document.activeElement === connect; })()`), 'Connect control is not explicitly named or focusable.');
    await press(cdp, 'Enter');
    await waitFor('SIM connection focus recovery', async () => await cdp!.evaluate(`(() => { const disconnect = document.querySelector('button[aria-label="Disconnect"]'); return disconnect && document.activeElement === disconnect ? true : undefined; })()`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const run = document.querySelector('button[aria-label="Run (F5)"]'); run?.focus(); return document.activeElement === run; })()`), 'Run control is not explicitly named or focusable.');
    await press(cdp, 'Enter');
    await waitFor('Pause state with focus preserved', async () => await cdp!.evaluate(`(() => { const pause = document.querySelector('button[aria-label="Pause (F6)"]'); return Boolean(pause) && document.activeElement === pause; })()`) === true ? true : undefined);
    await waitFor('Trace tab', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Trace,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    const armed = await waitFor('armed native scan', async () => { const state = await cdp!.evaluate(card) as { text: string; cycles: number } | null; return state && state.cycles > 0 && state.text.includes('Motor.ForwardOFF') && state.text.includes('Motor.ReverseOFF') ? state : undefined; });
    await waitFor('Start input', async () => await cdp!.evaluate(`(() => { const button = [...document.querySelectorAll('[aria-label="Live native POSIX motor"] button')].find((item) => item.textContent === 'Start'); if (!button || button.disabled) return undefined; button.click(); return true; })()`) === true ? true : undefined);
    const started = await waitFor('post-Start native scan', async () => { const state = await cdp!.evaluate(card) as { text: string; cycles: number } | null; return state && state.cycles > armed.cycles && state.text.includes('Motor.ForwardON') && state.text.includes('Motor.ReverseOFF') ? state : undefined; });
    await waitFor('E-stop assertion', async () => await cdp!.evaluate(`(() => { const button = [...document.querySelectorAll('[aria-label="Live native POSIX motor"] button')].find((item) => item.textContent === 'Assert E-stop'); if (!button || button.disabled) return undefined; button.click(); return true; })()`) === true ? true : undefined);
    const stopped = await waitFor('post-E-stop safe scan', async () => { const state = await cdp!.evaluate(card) as { text: string; cycles: number; startDisabled: boolean; stopDisabled: boolean; assertDisabled: boolean; releaseDisabled: boolean } | null; return state && state.cycles > started.cycles && state.text.includes('Motor.ForwardOFF') && state.text.includes('Motor.ReverseOFF') && state.text.includes('E-stop: asserted') && state.startDisabled && state.stopDisabled && state.assertDisabled && !state.releaseDisabled ? state : undefined; });
    await waitFor('E-stop release', async () => await cdp!.evaluate(`(() => { const button = [...document.querySelectorAll('[aria-label="Live native POSIX motor"] button')].find((item) => item.textContent === 'Release E-stop'); if (!button || button.disabled) return undefined; button.click(); return true; })()`) === true ? true : undefined);
    await waitFor('post-release native scan', async () => { const state = await cdp!.evaluate(card) as { text: string; cycles: number } | null; return state && state.cycles > stopped.cycles && state.text.includes('E-stop: released') ? state : undefined; });
    await waitFor('Disconnect', async () => await cdp!.evaluate(click('Disconnect')) === true ? true : undefined); await waitFor('motor panel removal', async () => await cdp!.evaluate('document.querySelector("[aria-label=\\"Live native POSIX motor\\"]") ? undefined : true') === true ? true : undefined);
    await waitFor('Tests tab', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Tests,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    assert(await cdp.evaluate(click('Run host scenarios')) === true, 'Run host scenarios is not actionable for the linked manifest.');
    const scenarioEvidence = await waitFor('native POSIX scenario evidence', async () => {
      const value = await cdp!.evaluate(`(() => ({ text: document.body.innerText, hashes: [...document.querySelectorAll('[aria-label^="SHA-256 "]')].map((node) => node.getAttribute('aria-label')), buildLink: document.querySelector('[aria-label="Canonical build test link"]')?.textContent }))()`) as { text: string; hashes: string[]; buildLink?: string };
      return value.text.includes('Host POSIX scenarios passed.') && value.buildLink?.includes('Canonical saved build linked') && value.hashes.length >= 2 ? value : undefined;
    });
    assert(scenarioEvidence.hashes.every((hash) => /^SHA-256 [0-9a-f]{64}$/.test(hash ?? '')), `Native scenario evidence hashes are invalid: ${JSON.stringify(scenarioEvidence)}`);
    // LNG-009: every open text file keeps its own content, undo history and cursor.
    const first = 'file:src/Motor.st';
    const originalFirst = await fileContent(cdp, first);
    assert(typeof originalFirst === 'string' && originalFirst.length > 0, 'Motor.st is not loaded for the per-file editor step.');
    const second = await storeEval(cdp, `return await state().createFile('Second', 'ST');`) as string;
    assert(second === 'file:src/Second.st', `Unexpected second file id: ${second}`);
    const originalSecond = await fileContent(cdp, second);
    await showFile(cdp, first);
    await monacoEval(cdp, `editor.setPosition({ lineNumber: 1, column: 1 }); editor.trigger('smoke', 'type', { text: 'AB' });`);
    await waitFor('typing in the first file', async () => (await fileContent(cdp!, first))?.startsWith('AB') ? true : undefined);
    await showFile(cdp, second);
    await showFile(cdp, first);
    await monacoEval(cdp, `editor.trigger('smoke', 'type', { text: 'C' });`);
    const typed = await waitFor('typing after returning to the first file', async () => { const content = await fileContent(cdp!, first); return content !== originalFirst && content?.includes('C') ? content : undefined; });
    assert(typed.startsWith('ABC'), `The first file lost its cursor across a tab switch: ${JSON.stringify(typed.slice(0, 20))}`);
    const modelPaths = (await monacoEval(cdp, `return monaco.editor.getModels().map((model) => model.uri.scheme + ':' + model.uri.path).sort();`) as string[]).filter((path) => path.startsWith('zplc-file:'));
    assert(modelPaths.length === 2 && /^zplc-file:\/\d+\/file:src\/Motor\.st$/.test(modelPaths[0]) && /^zplc-file:\/\d+\/file:src\/Second\.st$/.test(modelPaths[1]), `Each open text file must have its own Monaco model: ${JSON.stringify(modelPaths)}`);
    await showFile(cdp, second);
    await monacoEval(cdp, `editor.trigger('smoke', 'undo', null);`);
    await Bun.sleep(500);
    assert(await fileContent(cdp, second) === originalSecond, `Undo in the second file changed it: ${JSON.stringify((await fileContent(cdp, second))?.slice(0, 80))}`);
    assert(await fileContent(cdp, first) === typed, 'Undo in the second file changed the first file.');
    await showFile(cdp, first);
    await monacoEval(cdp, `editor.trigger('smoke', 'undo', null);`);
    await waitFor('undo in the first file', async () => (await fileContent(cdp!, first)) !== typed ? true : undefined);
    assert(await fileContent(cdp, second) === originalSecond, 'Undo in the first file changed the second file.');
    // IDE-005: closing a tab, the window or a reload with modified files asks first; cancel keeps everything.
    const closeTabButton = (id: string) => `(() => { const button = document.getElementById(${JSON.stringify(`editor-tab-${id}`)})?.parentElement?.querySelector('button[aria-label^="Close "]'); if (!button) return false; button.click(); return true; })()`;
    const openTabs = () => storeEval(cdp!, `return state().openTabs;`) as Promise<string[]>;
    assert(await storeEval(cdp, `return state().loadedFiles.get(${JSON.stringify(first)})?.isModified;`) === true, 'The first file should be modified before the close prompts.');
    assert(await cdp.evaluate(closeTabButton(first)) === true, 'The first file tab has no close button.');
    await expectPrompt(cdp, 'Unsaved changes in this tab');
    await answerPrompt(cdp, 'Cancel');
    await promptGone(cdp);
    assert((await openTabs()).includes(first) && await fileContent(cdp, first) !== originalFirst, 'Cancel must keep the modified tab open with its changes.');
    assert(await cdp.evaluate(closeTabButton(first)) === true, 'The first file tab has no close button after cancel.');
    await expectPrompt(cdp, 'Unsaved changes in this tab');
    await answerPrompt(cdp, 'Discard and close');
    await promptGone(cdp);
    assert(!(await openTabs()).includes(first) && await fileContent(cdp, first) === undefined, 'Discard must close the tab and drop the unsaved content.');
    assert(!(await monacoEval(cdp, `return monaco.editor.getModels().map((model) => model.uri.path);`) as string[]).some((path) => path.endsWith('/file:src/Motor.st')), 'Closing the tab must drop its Monaco model.');
    await storeEval(cdp, `await state().openFile(${JSON.stringify(first)}); return true;`);
    await showFile(cdp, first);
    assert(await fileContent(cdp, first) === originalFirst, 'Reopening a discarded file must read it from disk again.');
    await showFile(cdp, second);
    await monacoEval(cdp, `editor.trigger('smoke', 'type', { text: 'X' });`);
    await waitFor('second file modified', async () => await storeEval(cdp!, `return state().loadedFiles.get(${JSON.stringify(second)})?.isModified;`) === true ? true : undefined);
    await cdp.evaluate('window.__zplcSmokeDocument = 1');
    assert(electron.exitCode === null, 'Electron exited before the window close was requested.');
    void cdp.command('Browser.close').catch(() => undefined);
    await expectPrompt(cdp, 'Unsaved changes before you close');
    await answerPrompt(cdp, 'Cancel');
    await promptGone(cdp);
    assert(electron.exitCode === null && await cdp.evaluate('window.__zplcSmokeDocument') === 1, 'Cancel must keep the window open.');
    assert(await storeEval(cdp, `return state().hasUnsavedChanges();`) === true, 'Cancel must keep the unsaved changes.');
    // IDE-011: an exception inside the editor or a panel stays in that region; the rest of the window keeps working.
    assert(cdp.errors.length === 0, `Renderer errors before the containment step: ${cdp.errors.join(' | ')}`);
    const windowAlive = `(() => ({ tabs: Boolean(document.querySelector('[role="tablist"][aria-label="Editor views"]')), toolbar: Boolean(document.querySelector('[role="toolbar"][aria-label="Project operations"]')), panel: Boolean(document.querySelector('[role="tabpanel"][id^="console-panel-"]')) }))()`;
    const regionError = (region: string) => `document.querySelector('[role="alert"][data-region-error=${JSON.stringify(region)}]') !== null`;
    const savedConfig = await storeEval(cdp, `return state().projectConfig;`);
    await storeEval(cdp, `useIDEStore.setState({ showSettings: true, projectConfig: { name: 'broken', version: '1.0.0' } }); return true;`);
    await waitFor('Editor region error', async () => await cdp!.evaluate(regionError('Editor')) === true ? true : undefined);
    assert(JSON.stringify(await cdp.evaluate(windowAlive)) === JSON.stringify({ tabs: true, toolbar: true, panel: true }), 'An editor exception must leave the tabs, toolbar and panel alive.');
    await storeEval(cdp, `useIDEStore.setState({ projectConfig: ${JSON.stringify(savedConfig)} }); return true;`);
    assert(await cdp.evaluate(`(() => { const retry = [...document.querySelectorAll('[data-region-error="Editor"] button')].find((item) => item.textContent === 'Retry'); if (!retry) return false; retry.click(); return true; })()`) === true, 'The editor region error has no Retry action.');
    await waitFor('Editor region recovered after Retry', async () => await cdp!.evaluate(regionError('Editor')) === false ? true : undefined);
    await storeEval(cdp, `useIDEStore.setState({ showSettings: false }); return true;`);
    await storeEval(cdp, `useIDEStore.setState({ activeConsoleTab: 'output', isConsoleCollapsed: false, consoleEntries: [{ id: 'broken', type: 'info', message: { not: 'text' }, timestamp: new Date(), source: 'system' }] }); return true;`);
    await waitFor('Panel region error', async () => await cdp!.evaluate(regionError('Panel')) === true ? true : undefined);
    assert(JSON.stringify(await cdp.evaluate(windowAlive)) === JSON.stringify({ tabs: true, toolbar: true, panel: true }), 'A panel exception must leave the editor tabs, toolbar and panel tabs alive.');
    await storeEval(cdp, `state().clearConsole(); useIDEStore.setState({ activeConsoleTab: 'tests' }); return true;`);
    await waitFor('Panel region recovered by switching tab', async () => await cdp!.evaluate(regionError('Panel')) === false ? true : undefined);
    cdp.errors.splice(0); cdp.errorDetails.splice(0);
    // LNG-011: a Ladder file is validated when it opens; an invalid one names itself and its violations and leaves the window alive.
    const fileError = `document.querySelector('[role="alert"][data-file-error]')?.textContent ?? null`;
    const ladder = await storeEval(cdp, `return await state().createFile('Broken', 'LD');`) as string;
    await waitFor('valid new Ladder file shown', async () => await storeEval(cdp!, `return state().activeFileId === ${JSON.stringify(ladder)} ? true : undefined;`) === true ? true : undefined);
    await Bun.sleep(300);
    assert(await cdp.evaluate(fileError) === null, 'A valid new Ladder file must open without an error.');
    await storeEval(cdp, `state().updateFileContent(${JSON.stringify(ladder)}, ${JSON.stringify(JSON.stringify({ name: 'Broken', variables: { local: [], outputs: [] }, rungs: [{ id: 'rung_1' }] }))}); return true;`);
    const ladderPath = ladder.slice('file:'.length);
    await waitFor('invalid Ladder file error', async () => String(await cdp!.evaluate(fileError)).includes(ladderPath) ? true : undefined);
    const ladderError = String(await cdp.evaluate(fileError));
    assert(ladderError.includes('Invalid LD file') && ladderError.includes('rungs[0].number'), `The Ladder error should name the file and the first violations: ${ladderError}`);
    assert(JSON.stringify(await cdp.evaluate(windowAlive)) === JSON.stringify({ tabs: true, toolbar: true, panel: true }), 'An invalid Ladder file must leave the window alive.');
    await storeEval(cdp, `state().discardFile(${JSON.stringify(ladder)}); return true;`);
    const finalFrame = await cdp.command('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
    assert((finalFrame.frameTree?.frame?.id ?? '') === mainFrameId, 'Renderer main frame changed during smoke.');
    assert(JSON.stringify(await cdp.evaluate('window.electronAPI.getAppInfo()')) === JSON.stringify(appInfo), 'Preload IPC identity changed during smoke.');
    assert(cdp.errors.length === 0, `Renderer errors: ${cdp.errors.join(' | ')} details=${cdp.errorDetails.join(' | ')}`);
    void cdp.command('Browser.close').catch(() => undefined);
    await expectPrompt(cdp, 'Unsaved changes before you close');
    await answerPrompt(cdp, 'Discard and close');
    assert(await Promise.race([electron.exited, Bun.sleep(10_000).then(() => null)]) === 0, 'Discard must close the window and exit cleanly.');
    console.log('Electron development-host Motor Start/Stop smoke passed through real preload/IPC and native POSIX. It is not hardware, HIL, Zephyr, timing, or packaged-artifact evidence.');
  } catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-12_000)}`); } finally { if (cdp) await cdp.command('Browser.close').catch(() => undefined); cdp?.close(); await Promise.race([electron?.exited ?? Promise.resolve(), Bun.sleep(3_000)]); await stop(electron); await stop(vite); if (tempRoot.startsWith(join(tmpdir(), 'zplc-electron-smoke-')) && existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true }); }
}
// The journey runner (run-journeys.ts) reuses these start-up and CDP helpers; importing this file starts nothing.
export { assert, assertSmokePortAvailable, Cdp, drain, freePort, HOST, packageRoot, preflight, smokeVitePort, stop, waitFor };
export type { OwnedProcess };
if (import.meta.main) await main();
