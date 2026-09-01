/** Real Electron development-host smoke; native POSIX only, never HIL. */
import { accessSync, constants, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
function drain(process: OwnedProcess, output: string[], label: string): void { const append = (chunk: Uint8Array) => { output.push(`${label}: ${new TextDecoder().decode(chunk)}`); while (output.join('').length > 12_000) output.shift(); }; void (async () => { for await (const chunk of process.stdout) append(chunk); })(); void (async () => { for await (const chunk of process.stderr) append(chunk); })(); }

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
  const keyCode = key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0;
  const text = key === 'Enter' ? '\r' : undefined;
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}
const card = `(() => { const panel = document.querySelector('[aria-label="Live native POSIX motor"]'); if (!panel) return null; const text = panel.textContent ?? ''; const get = (name) => Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === name)?.disabled; return { text, cycles: Number((text.match(/·\\s*(\\d+) cycles/) ?? [])[1]), startDisabled: get('Start'), stopDisabled: get('Stop'), assertDisabled: get('Assert E-stop'), releaseDisabled: get('Release E-stop') }; })()`;

async function main(): Promise<void> {
  const runtime = preflight(); const vitePort = smokeVitePort(); const rendererUrl = trustedDevelopmentRendererUrl(vitePort); const tempRoot = mkdtempSync(join(tmpdir(), 'zplc-electron-smoke-')); const output: string[] = [];
  let vite: OwnedProcess | undefined; let electron: OwnedProcess | undefined; let cdp: Cdp | undefined;
  try {
    const scenarioWorkspace = join(tempRoot, 'motor-start-stop');
    cpSync(join(packageRoot, 'projects', 'motor_start_stop'), scenarioWorkspace, { recursive: true });
    const cdpPort = await freePort();
    await assertSmokePortAvailable(vitePort);
    vite = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(vitePort), '--strictPort'], { cwd: packageRoot, stdout: 'pipe', stderr: 'pipe' }); drain(vite, output, 'vite');
    await waitFor('Vite at the owned trusted origin', async () => (await fetch(`http://${HOST}:${vitePort}/`).catch(() => null))?.ok ? true : undefined); assert(vite.exitCode === null, `Vite exited before Electron could use ${rendererUrl} (the port may be occupied).`);
    const electronPath = join(packageRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
    electron = Bun.spawn([electronPath, '--headless', '--disable-gpu', `--zplc-smoke-port=${vitePort}`, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(tempRoot, 'profile')}`, '.'], { cwd: packageRoot, env: { ...process.env, NODE_ENV: 'development', ZPLC_NATIVE_SIM_BIN: runtime, ZPLC_PERSIST_ROOT: join(tempRoot, 'persist') }, stdout: 'pipe', stderr: 'pipe' }); drain(electron, output, 'electron');
    let targetSummary = '';
    const target = await waitFor('real Electron renderer target', async () => { const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()).catch(() => [] as Array<{ type?: string; url?: string; title?: string; webSocketDebuggerUrl?: string }>); targetSummary = JSON.stringify(targets.map(({ type, url, title }) => ({ type, url, title }))); return targets.find((item) => item.type === 'page' && item.url === rendererUrl && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl; });
    cdp = await Cdp.connect(target); await cdp.command('Runtime.enable'); await cdp.command('Log.enable'); await cdp.command('Page.enable'); await cdp.command('Page.bringToFront'); await cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    const bridge = await waitFor('real preload bridge', async () => { const value = await cdp!.evaluate('({ href: location.href, bridge: Boolean(window.electronAPI?.isElectron && window.electronAPI.nativeSimulation), keys: Object.keys(window).filter((key) => key.toLowerCase().includes("electron")) })') as { bridge?: unknown }; return value.bridge === true ? value : undefined; }).catch((error: unknown) => { throw new Error(`${error instanceof Error ? error.message : String(error)} targets=${targetSummary}`); });
    assert((bridge as { bridge?: unknown }).bridge === true, `The real preload bridge is unavailable: ${JSON.stringify(bridge)} targets=${targetSummary}`);
    const appInfo = await cdp.evaluate('window.electronAPI.getAppInfo()');
    const frame = await cdp.command('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
    const mainFrameId = frame.frameTree?.frame?.id ?? '';
    const electronVersion = JSON.parse(readFileSync(join(packageRoot, 'node_modules', 'electron', 'package.json'), 'utf8')).version as string;
    // Electron 43.4.1 headless/CDP bootstrap quarantine; remove when Electron changes.
    assert(isElectronHeadlessBootstrapQuarantine(electronVersion, cdp.errorDetails, mainFrameId), `Unexpected initial CDP diagnostics: ${cdp.errorDetails.join(' | ')}`);
    cdp.errors.splice(0); cdp.errorDetails.splice(0);
    let rendererText = '';
    await waitFor('Motor Start Stop example', async () => { rendererText = String(await cdp!.evaluate('document.body.innerText')); return rendererText.includes('Motor Start Stop') ? true : undefined; }).catch((error: unknown) => { throw new Error(`${error instanceof Error ? error.message : String(error)} renderer=${rendererText.slice(0, 1_000)}`); });
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Toggle high contrast theme"]'); button?.focus(); const style = button ? getComputedStyle(button) : null; return Boolean(button && document.activeElement === button && button.matches(':focus-visible') && style?.outlineStyle !== 'none'); })()`), 'Welcome high-contrast control does not expose a visible keyboard focus state.');
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Switch to dark theme"]'); button?.click(); return document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor === 'rgb(15, 23, 27)'; })()`), 'Explicit dark theme did not apply its authored surface.');
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Toggle high contrast theme"]'); button?.click(); return document.documentElement.classList.contains('high-contrast') && getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)'; })()`), 'Explicit high-contrast theme did not apply its authored surface.');
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Switch to light theme"]'); button?.click(); return document.documentElement.classList.contains('light') && getComputedStyle(document.body).backgroundColor === 'rgb(231, 236, 232)'; })()`), 'Explicit light theme did not restore its authored surface.');
    await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reducedMotion = await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Toggle high contrast theme"]'); const style = button ? getComputedStyle(button) : null; return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, duration: style?.transitionDuration, ok: Boolean(style?.transitionDuration.split(',').every((value) => Number.parseFloat(value) <= 0.01)) }; })()`) as { matches: boolean; duration?: string; ok: boolean };
    assert(reducedMotion.matches && reducedMotion.ok, `Reduced-motion media did not suppress welcome control transitions: ${JSON.stringify(reducedMotion)}.`);
    await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Toggle high contrast theme"]'); button?.focus(); const style = button ? getComputedStyle(button) : null; return Boolean(matchMedia('(forced-colors: active)').matches && button?.matches(':focus-visible') && style?.outlineStyle !== 'none' && style?.outlineColor !== 'rgba(0, 0, 0, 0)'); })()`), 'Forced-colors media did not preserve a visible keyboard focus outline.');
    await cdp.command('Emulation.setEmulatedMedia', { features: [] });
    await cdp.evaluate(`(() => {
      const files = new Map(); const directories = new Set(['', 'src', 'tests']);
      const missing = () => { throw new DOMException('Not found', 'NotFoundError'); };
      const directory = (path) => ({ name: path ? path.split('/').at(-1) : 'copied-motor-start-stop',
        async getFileHandle(name, options) { const key = path ? path + '/' + name : name; if (!files.has(key)) { if (!options?.create) missing(); files.set(key, ''); } return { async getFile() { const content = files.get(key) ?? ''; return { size: content.length, async text() { return content; } }; }, async createWritable() { return { async write(content) { files.set(key, String(content)); }, async close() {} }; } }; },
        async getDirectoryHandle(name, options) { const key = path ? path + '/' + name : name; if (!directories.has(key)) { if (!options?.create) missing(); directories.add(key); } return directory(key); },
        async *values() { const prefix = path ? path + '/' : ''; for (const name of directories) { if (name && name.startsWith(prefix) && !name.slice(prefix.length).includes('/')) yield { kind: 'directory', name: name.slice(prefix.length) }; } for (const name of files.keys()) { if (name.startsWith(prefix) && !name.slice(prefix.length).includes('/')) yield { kind: 'file', name: name.slice(prefix.length) }; } },
      });
      const handle = directory(''); let pickerCalls = 0;
      window.__zplcSmokeExampleCopy = { handle, files, get pickerCalls() { return pickerCalls; } };
      Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => { pickerCalls += 1; return handle; } });
    })()`);
    assert(await cdp.evaluate(click('Motor Start Stop')) === true, 'Motor Start Stop example button is not actionable.');
    const copiedExample = await waitFor('copied Motor Start Stop example', async () => await cdp!.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); const copy = window.__zplcSmokeExampleCopy; return state.isProjectOpen && state.directoryHandle === copy.handle ? { pickerCalls: copy.pickerCalls, migrationPreview: state.projectMigrationPreview, scenario: copy.files.get('tests/motor-start-stop.scenario.json'), active: state.activeFileId } : undefined; })`) as { pickerCalls: number; migrationPreview: unknown; scenario: string | undefined; active: string | null } | undefined);
    assert(copiedExample?.pickerCalls === 1 && copiedExample.migrationPreview === null && typeof copiedExample.scenario === 'string' && copiedExample.active === 'file:src/Motor.st', `Example copy did not finish as one disk-backed session: ${JSON.stringify(copiedExample)}`);
    await waitFor('Tests tab', async () => await cdp!.evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Tests,')); if (!tab) return false; tab.click(); return true; })()`) === true ? true : undefined);
    const documentRoot = await cdp.command('DOM.getDocument') as { root?: { nodeId?: number } };
    const manifestInputNode = await cdp.command('DOM.querySelector', { nodeId: documentRoot.root?.nodeId, selector: 'input[data-workspace-manifest-input]' }) as { nodeId?: number };
    assert(manifestInputNode.nodeId, 'The Tests tab does not expose its manifest file input.');
    await cdp.command('DOM.setFileInputFiles', { files: [join(scenarioWorkspace, 'zplc.json')], nodeId: manifestInputNode.nodeId });
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
    const finalFrame = await cdp.command('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
    assert((finalFrame.frameTree?.frame?.id ?? '') === mainFrameId, 'Renderer main frame changed during smoke.');
    assert(JSON.stringify(await cdp.evaluate('window.electronAPI.getAppInfo()')) === JSON.stringify(appInfo), 'Preload IPC identity changed during smoke.');
    assert(cdp.errors.length === 0, `Renderer errors: ${cdp.errors.join(' | ')} details=${cdp.errorDetails.join(' | ')}`);
    console.log('Electron development-host Motor Start/Stop smoke passed through real preload/IPC and native POSIX. It is not hardware, HIL, Zephyr, timing, or packaged-artifact evidence.');
  } catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-12_000)}`); } finally { if (cdp) await cdp.command('Browser.close').catch(() => undefined); cdp?.close(); await Promise.race([electron?.exited ?? Promise.resolve(), Bun.sleep(3_000)]); await stop(electron); await stop(vite); if (tempRoot.startsWith(join(tmpdir(), 'zplc-electron-smoke-')) && existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true }); }
}
await main();
