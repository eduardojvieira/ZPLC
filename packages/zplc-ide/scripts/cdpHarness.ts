/**
 * A small Chromium DevTools driver for the smokes that need no Electron (REL-037). It starts a headless Chromium on a
 * private profile, speaks the DevTools protocol over its WebSocket and collects every page error and console error.
 */
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export const HOST = '127.0.0.1';
const TIMEOUT_MS = 30_000;

export type OwnedProcess = ReturnType<typeof Bun.spawn>;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function executable(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try { accessSync(path, constants.X_OK); return path; } catch { return undefined; }
}

export function chromium(): string {
  const explicit = executable(process.env.ZPLC_CHROMIUM_BIN) ?? executable(process.env.CHROME_BIN);
  if (explicit) return explicit;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }
  // The browsers that the hosted macOS and Windows runners ship, which are not on the PATH (authored here, not run on those systems).
  const installed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const candidate of installed) {
    const found = executable(candidate);
    if (found) return found;
  }
  throw new Error('Chrome/Chromium not found. Set ZPLC_CHROMIUM_BIN to an executable browser path.');
}

export async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

export async function waitFor<T>(description: string, check: () => Promise<T | undefined> | T | undefined, timeoutMs = TIMEOUT_MS): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch (error) { lastError = error; }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
}

export async function stop(process: OwnedProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill();
  await Promise.race([process.exited, Bun.sleep(3_000)]);
  if (process.exitCode === null) { process.kill('SIGKILL'); await process.exited; }
}

type Message = { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: { exceptionDetails?: { text?: string; exception?: { description?: string } }; entry?: { level?: string; text?: string }; type?: string; args?: Array<{ value?: unknown; description?: string }> } };

export class Cdp {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  /** Page exceptions, console errors and browser log errors (a blocked script or a content security policy violation among them). */
  readonly errors: string[] = [];

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed'));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Runtime exception');
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') this.errors.push(message.params.entry.text ?? 'Browser log error');
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') this.errors.push(message.params.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') || 'console.error');
    });
    const fail = (error: Error) => { for (const pending of this.#pending.values()) pending.reject(error); this.#pending.clear(); };
    socket.addEventListener('close', () => fail(new Error('CDP WebSocket closed')));
    socket.addEventListener('error', () => fail(new Error('CDP WebSocket failed')));
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true });
    });
    return new Cdp(socket);
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.#nextId++;
    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, TIMEOUT_MS);
      this.#pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return await response;
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Page evaluation failed');
    return result.result?.value;
  }

  close(): void { this.#socket.close(); }
}

/** Starts headless Chromium on `url` with a private profile folder and returns the process and a connected DevTools session. */
export async function openPage(url: string, profile: string): Promise<{ browser: OwnedProcess; cdp: Cdp }> {
  const browser = Bun.spawn([chromium(), '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', url], { stdout: 'ignore', stderr: 'ignore' });
  const debugPort = await waitFor('the Chromium DevTools port', () => {
    const activePort = join(profile, 'DevToolsActivePort');
    if (!existsSync(activePort)) return undefined;
    const port = Number(readFileSync(activePort, 'utf8').split(/\r?\n/, 1)[0]);
    return Number.isInteger(port) && port > 0 ? port : undefined;
  });
  const target = await waitFor('the Chromium page', async () => {
    const targets: Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }> = await fetch(`http://${HOST}:${debugPort}/json/list`).then((response) => response.json() as Promise<Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>>).catch(() => []);
    return targets.find((item) => item.type === 'page' && item.url === url && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  });
  const cdp = await Cdp.connect(target);
  await cdp.command('Runtime.enable'); await cdp.command('Log.enable'); await cdp.command('Page.enable');
  await cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  return { browser, cdp };
}
