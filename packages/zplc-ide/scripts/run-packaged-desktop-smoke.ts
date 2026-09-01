/** Real packaged Electron launch smoke; host-only, never HIL. */
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isElectronHeadlessBootstrapQuarantine } from './electronHeadlessQuarantine';

const HOST = '127.0.0.1';
const TIMEOUT_MS = 20_000;
const packageRoot = join(import.meta.dir, '..');
type OwnedProcess = ReturnType<typeof Bun.spawn>;

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export function discoverPackagedExecutable(distDir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'linux' && platform !== 'win32' && platform !== 'darwin') {
    throw new Error(`Packaged desktop smoke does not support host platform: ${platform}`);
  }
  const candidates: string[] = [];
  const root = resolve(distDir);
  const rootStat = lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), `Packaged desktop smoke requires a real dist directory: ${root}`);
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const isUnpacked = platform === 'darwin' ? entry.name.endsWith('.app') : entry.name.endsWith('-unpacked');
      if (isUnpacked) {
        if (entry.isSymbolicLink()) throw new Error(`Packaged desktop smoke refused symlink unpacked app: ${path}`);
        if (entry.isDirectory()) candidates.push(path);
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path);
    }
  }
  assert(candidates.length === 1, `Packaged desktop smoke requires exactly one ${platform} unpacked app, found ${candidates.length}.`);
  const executable = platform === 'darwin'
    ? join(candidates[0], 'Contents', 'MacOS', 'zplc-ide')
    : join(candidates[0], platform === 'win32' ? 'zplc-ide.exe' : 'zplc-ide');
  const stat = existsSync(executable) ? lstatSync(executable) : null;
  assert(stat?.isFile() && !stat.isSymbolicLink(), `Packaged desktop smoke requires a real zplc-ide executable: ${executable}`);
  if (platform !== 'win32') {
    try { accessSync(executable, constants.X_OK); } catch { throw new Error(`Packaged desktop smoke executable is not executable: ${executable}`); }
  }
  return executable;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

async function waitFor<T>(description: string, check: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  let last: unknown;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value !== undefined) return value; } catch (error) { last = error; }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`);
}

async function stop(process: OwnedProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill('SIGTERM');
  await Promise.race([process.exited, Bun.sleep(3_000)]);
  if (process.exitCode === null) { process.kill('SIGKILL'); await process.exited; }
}

function drain(process: OwnedProcess, output: string[]): void {
  const append = (chunk: Uint8Array) => {
    output.push(new TextDecoder().decode(chunk));
    while (output.join('').length > 12_000) output.shift();
  };
  void (async () => { for await (const chunk of process.stdout) append(chunk); })();
  void (async () => { for await (const chunk of process.stderr) append(chunk); })();
}

class Cdp {
  #socket: WebSocket;
  #id = 1;
  #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  #contexts = new Map<number, string>();
  readonly errorDetails: string[] = [];

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: { executionContextId?: number; context?: { id?: number; origin?: string; name?: string; auxData?: Record<string, unknown> }; exceptionDetails?: { text?: string; exception?: { description?: string }; executionContextId?: number; stackTrace?: { callFrames?: Array<{ url?: string }> } }; entry?: { level?: string; text?: string; url?: string; lineNumber?: number }; type?: string; args?: Array<{ value?: unknown; description?: string }>; stackTrace?: { callFrames?: Array<{ url?: string }> } } };
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed')); else pending.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.executionContextCreated') {
        const context = message.params?.context;
        if (context?.id !== undefined) this.#contexts.set(context.id, JSON.stringify({ id: context.id, origin: context.origin, name: context.name, ...context.auxData }));
        return;
      }
      const isError = message.method === 'Runtime.exceptionThrown' || (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') || (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error');
      if (!isError) return;
      const human = message.method === 'Runtime.exceptionThrown' ? message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Runtime exception' : message.method === 'Log.entryAdded' ? message.params?.entry?.text ?? 'Browser log error' : message.params?.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') || 'console.error';
      const contextId = message.params?.executionContextId ?? message.params?.exceptionDetails?.executionContextId;
      const frames = message.params?.stackTrace?.callFrames ?? message.params?.exceptionDetails?.stackTrace?.callFrames ?? [];
      this.errorDetails.push(JSON.stringify({ method: message.method, human, context: contextId === undefined ? undefined : this.#contexts.get(contextId), source: message.params?.entry?.url, line: message.params?.entry?.lineNumber, stack: frames.slice(0, 3) }));
    });
    const reject = () => { for (const pending of this.#pending.values()) pending.reject(new Error('CDP WebSocket closed')); this.#pending.clear(); };
    socket.addEventListener('close', reject);
    socket.addEventListener('error', reject);
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true }); });
    return new Cdp(socket);
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.#id++;
    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, TIMEOUT_MS);
      this.#pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return await response;
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Page evaluation failed');
    return response.result?.value;
  }

  close(): void { this.#socket.close(); }
}

async function press(cdp: Cdp, key: string, code = key): Promise<void> {
  const keyCode = key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0;
  const text = key === 'Enter' ? '\r' : undefined;
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

async function main(): Promise<void> {
  const executable = discoverPackagedExecutable(join(packageRoot, 'dist-electron'));
  const tempRoot = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
  const output: string[] = [];
  let electron: OwnedProcess | undefined;
  let cdp: Cdp | undefined;
  try {
    const cdpPort = await freePort();
    electron = Bun.spawn([executable, '--headless', '--disable-gpu', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(tempRoot, 'profile')}`], { stdout: 'pipe', stderr: 'pipe' });
    drain(electron, output);
    const target = await waitFor('packaged file renderer target', async () => {
      const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()).catch(() => [] as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>);
      return targets.find((item) => item.type === 'page' && item.url?.startsWith('file:') && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    });
    cdp = await Cdp.connect(target);
    await cdp.command('Runtime.enable');
    await cdp.command('Log.enable');
    await cdp.command('Page.enable');
    await cdp.command('Page.bringToFront');
    await cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    const identity = await waitFor('packaged preload bridge', async () => await cdp!.evaluate('window.electronAPI?.getAppInfo ? Promise.all([location.protocol, window.electronAPI.getAppInfo()]) : undefined') as [string, { isPackaged?: unknown; platform?: unknown; arch?: unknown }] | undefined);
    assert(identity[0] === 'file:', `Packaged renderer origin is not file:: ${identity[0]}`);
    assert(identity[1].isPackaged === true && identity[1].platform === process.platform && identity[1].arch === process.arch, `Unexpected packaged preload app info: ${JSON.stringify(identity[1])}`);
    await waitFor('packaged Welcome screen', async () => await cdp!.evaluate(`(() => {
      const heading = document.querySelector('h1');
      const contrast = document.querySelector('button[aria-label="Toggle high contrast theme"]');
      return heading?.textContent === 'ZPLC Studio 2.0' && contrast ? true : undefined;
    })()`) as boolean | undefined);
    const rendererBoundary = (await cdp.evaluate(`(() => ({
      node: ['process', 'require', 'module', 'Buffer'].map((key) => [key, typeof window[key]]),
      preload: Object.keys(window.electronAPI ?? {}).sort(),
      welcome: document.body.innerText.includes('ZPLC Studio 2.0'),
    }))()`)) as { node: Array<[string, string]>; preload: string[]; welcome: boolean };
    assert(rendererBoundary.node.every(([, value]) => value === 'undefined'), `Node globals leaked into packaged renderer: ${JSON.stringify(rendererBoundary.node)}`);
    assert(JSON.stringify(rendererBoundary.preload) === JSON.stringify(['aiProvider', 'candidateChangeSet', 'firmwareBuild', 'getAppInfo', 'isElectron', 'learnProgress', 'nativeSimulation', 'platform', 'toolExecutionAudit', 'toolchain', 'workspaceTests']), `Unexpected packaged preload surface: ${JSON.stringify(rendererBoundary.preload)}`);
    assert(rendererBoundary.welcome, 'Packaged renderer did not render the folder-backed Welcome screen.');
    assert(await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Toggle high contrast theme"]'); button?.focus(); return Boolean(button && document.activeElement === button && button.matches(':focus-visible') && getComputedStyle(button).outlineStyle !== 'none'); })()`), 'Packaged Welcome high-contrast control is not keyboard focusable.');
    await press(cdp, 'Enter');
    assert(await cdp.evaluate(`document.documentElement.classList.contains('high-contrast') && getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)'`), 'Packaged Welcome did not activate explicit high contrast by keyboard.');
    const targetCount = (await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()) as Array<{ type?: string }>).filter((item) => item.type === 'page').length;
    const navigation = (await cdp.evaluate(`(() => { const href = location.href; const opened = window.open('https://example.invalid/zplc-packaged-smoke'); return { href, sameDocument: location.href === href, opened: opened === null }; })()`)) as { sameDocument: boolean; opened: boolean };
    await Bun.sleep(100);
    const targetCountAfterOpen = (await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json()) as Array<{ type?: string }>).filter((item) => item.type === 'page').length;
    assert(navigation.sameDocument && navigation.opened && targetCountAfterOpen === targetCount, 'Packaged renderer opened a new window or navigated away from its file:// document.');
    await Bun.sleep(250);
    const frame = await cdp.command('Page.getFrameTree') as { frameTree?: { frame?: { id?: string } } };
    const version = JSON.parse(await Bun.file(join(packageRoot, 'node_modules', 'electron', 'package.json')).text()).version as string;
    assert(isElectronHeadlessBootstrapQuarantine(version, cdp.errorDetails, frame.frameTree?.frame?.id ?? ''), `Unexpected renderer diagnostics: ${cdp.errorDetails.join(' | ')}`);
    void cdp.command('Browser.close').catch(() => undefined);
    const exitCode = await Promise.race([electron.exited, Bun.sleep(3_000).then(() => null)]);
    cdp.close();
    cdp = undefined;
    assert(exitCode === 0, `Packaged Electron did not exit cleanly: ${exitCode}`);
    console.log(`Packaged ${process.platform}/${process.arch} Electron launch smoke passed through file:// preload IPC. Host/package evidence only; not installer, HIL, or hardware evidence.`);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-12_000)}`);
  } finally {
    if (cdp) await cdp.command('Browser.close').catch(() => undefined);
    cdp?.close();
    await stop(electron);
    if (tempRoot.startsWith(join(tmpdir(), 'zplc-packaged-smoke-')) && existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
