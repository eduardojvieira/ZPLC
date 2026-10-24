/** Real packaged Electron launch smoke; host-only, never HIL. */
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseFirmwareImagesResult } from '../electron/firmwareImagesProtocol';
import { isElectronHeadlessBootstrapQuarantine } from './electronHeadlessQuarantine';

const HOST = '127.0.0.1';
const TIMEOUT_MS = 20_000;
const packageRoot = join(import.meta.dir, '..');
type OwnedProcess = ReturnType<typeof Bun.spawn>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

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
  const executable =
    platform === 'darwin'
      ? join(candidates[0], 'Contents', 'MacOS', 'ZPLC')
      : join(candidates[0], platform === 'win32' ? 'zplc.exe' : 'zplc');
  const stat = existsSync(executable) ? lstatSync(executable) : null;
  assert(stat?.isFile() && !stat.isSymbolicLink(), `Packaged desktop smoke requires a real zplc executable: ${executable}`);
  if (platform !== 'win32') {
    try {
      accessSync(executable, constants.X_OK);
    } catch {
      throw new Error(`Packaged desktop smoke executable is not executable: ${executable}`);
    }
  }
  return executable;
}

/**
 * The executable of an installed or extracted copy of the application (REL-036): the one that a silent install, a mounted
 * disk image or an extracted archive left, named by ZPLC_PACKAGED_EXECUTABLE. It must be a real file, not a link, and
 * executable where the system has that notion.
 */
export function installedExecutable(path: string, platform: NodeJS.Platform = process.platform): string {
  const executable = resolve(path);
  const stat = existsSync(executable) ? lstatSync(executable) : null;
  assert(stat?.isFile() && !stat.isSymbolicLink(), `The installed application is not a real file: ${executable}`);
  if (platform !== 'win32') {
    try {
      accessSync(executable, constants.X_OK);
    } catch {
      throw new Error(`The installed application is not executable: ${executable}`);
    }
  }
  return executable;
}

/** The top-level objects the packaged preload gives the renderer, sorted; the preload unit test holds the preload to it too. */
export const PACKAGED_PRELOAD_SURFACE = [
  'aiProvider',
  'candidateChangeSet',
  'closeGuard',
  'firmwareBuild',
  'firmwareImages',
  'getAppInfo',
  'isElectron',
  'learnProgress',
  'learnWorkspace',
  'menu',
  'nativeSimulation',
  'platform',
  'portChoice',
  'projectFiles',
  'recovery',
  'session',
  'toolExecutionAudit',
  'toolchain',
  'updateCheck',
  'windowPreferences',
  'workspaceTests',
] as const;

/**
 * Whether a menu accelerator reloads the page or opens the developer tools (IDE-005): Ctrl or Cmd with R, with or without
 * Shift (the chords electron/appMenu.ts isReloadShortcut catches), F12, and Ctrl or Cmd with Shift and I. F5 is not one:
 * Studio uses it for Resume.
 */
export function isReloadOrDevToolsAccelerator(accelerator: string): boolean {
  const parts = accelerator.toLowerCase().split('+');
  const key = parts.at(-1);
  const modifiers = new Set(parts.slice(0, -1));
  if (key === 'f12') return true;
  const command = ['cmdorctrl', 'commandorcontrol', 'ctrl', 'control', 'cmd', 'command', 'super', 'meta'].some((m) => modifiers.has(m));
  if (!command || modifiers.has('alt') || modifiers.has('option')) return false;
  return key === 'r' || (key === 'i' && modifiers.has('shift'));
}

/** What exists only in a build made for the suite (VF-008): a released installer contains none of it. */
export const DEV_ONLY_VARIABLE = 'ZPLC_SMOKE_FOLDER_ANSWER_FILE';
const DEV_ONLY_MODULE = /(^|\/)devFolderDialogHook\.js(\.map)?$/;

/** The archive of the app inside an unpacked package, given the executable that discoverPackagedExecutable found. */
export function packagedAsarPath(executable: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'darwin'
    ? join(dirname(executable), '..', 'Resources', 'app.asar')
    : join(dirname(executable), 'resources', 'app.asar');
}

interface AsarDirectory {
  files: Record<string, AsarDirectory | { size: number }>;
}

/**
 * Every file path in the JSON header of an asar archive: four little-endian 32-bit words (the fourth is the header length), then the header
 * text.
 */
export function listAsarFiles(asar: Uint8Array): string[] {
  const length = new DataView(asar.buffer, asar.byteOffset, asar.byteLength).getUint32(12, true);
  const header = JSON.parse(new TextDecoder().decode(asar.subarray(16, 16 + length))) as AsarDirectory;
  const walk = (directory: AsarDirectory, prefix: string): string[] =>
    Object.entries(directory.files).flatMap(([name, entry]) =>
      'files' in entry ? walk(entry, `${prefix}${name}/`) : [`${prefix}${name}`],
    );
  return walk(header, '');
}

/** Fails when the archive lists the dev-only hook module, or holds its variable name in any file (asar stores file bytes uncompressed). */
export function assertAsarHasNoDevOnlyCode(asar: Uint8Array): void {
  const modules = listAsarFiles(asar).filter((file) => DEV_ONLY_MODULE.test(file));
  assert(modules.length === 0, `Packaged app.asar contains the dev-only folder dialog hook module: ${modules.join(', ')}`);
  assert(
    !Buffer.from(asar.buffer, asar.byteOffset, asar.byteLength).includes(DEV_ONLY_VARIABLE),
    `Packaged app.asar contains ${DEV_ONLY_VARIABLE}: the folder dialog test hook shipped.`,
  );
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
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch (error) {
      last = error;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`);
}

async function stop(process: OwnedProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill('SIGTERM');
  await Promise.race([process.exited, Bun.sleep(3_000)]);
  if (process.exitCode === null) {
    process.kill('SIGKILL');
    await process.exited;
  }
}

function drain(process: OwnedProcess, output: string[]): void {
  const append = (chunk: Uint8Array) => {
    output.push(new TextDecoder().decode(chunk));
    while (output.join('').length > 12_000) output.shift();
  };
  for (const stream of [process.stdout, process.stderr]) {
    if (stream && typeof stream === 'object')
      void (async () => {
        for await (const chunk of stream) append(chunk);
      })();
  }
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
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
        method?: string;
        params?: {
          executionContextId?: number;
          context?: { id?: number; origin?: string; name?: string; auxData?: Record<string, unknown> };
          exceptionDetails?: {
            text?: string;
            exception?: { description?: string };
            executionContextId?: number;
            stackTrace?: { callFrames?: Array<{ url?: string }> };
          };
          entry?: { level?: string; text?: string; url?: string; lineNumber?: number };
          type?: string;
          args?: Array<{ value?: unknown; description?: string }>;
          stackTrace?: { callFrames?: Array<{ url?: string }> };
        };
      };
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed'));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.executionContextCreated') {
        const context = message.params?.context;
        if (context?.id !== undefined)
          this.#contexts.set(
            context.id,
            JSON.stringify({ id: context.id, origin: context.origin, name: context.name, ...context.auxData }),
          );
        return;
      }
      const isError =
        message.method === 'Runtime.exceptionThrown' ||
        (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') ||
        (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error');
      if (!isError) return;
      const human =
        message.method === 'Runtime.exceptionThrown'
          ? (message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Runtime exception')
          : message.method === 'Log.entryAdded'
            ? (message.params?.entry?.text ?? 'Browser log error')
            : message.params?.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') || 'console.error';
      const contextId = message.params?.executionContextId ?? message.params?.exceptionDetails?.executionContextId;
      const frames = message.params?.stackTrace?.callFrames ?? message.params?.exceptionDetails?.stackTrace?.callFrames ?? [];
      this.errorDetails.push(
        JSON.stringify({
          method: message.method,
          human,
          context: contextId === undefined ? undefined : this.#contexts.get(contextId),
          source: message.params?.entry?.url,
          line: message.params?.entry?.lineNumber,
          stack: frames.slice(0, 3),
        }),
      );
    });
    const reject = () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('CDP WebSocket closed'));
      this.#pending.clear();
    };
    socket.addEventListener('close', reject);
    socket.addEventListener('error', reject);
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
    const id = this.#id++;
    const response = new Promise<unknown>((resolve, reject) => {
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
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return await response;
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = (await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
      result?: { value?: unknown };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (response.exceptionDetails)
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Page evaluation failed');
    return response.result?.value;
  }

  close(): void {
    this.#socket.close();
  }
}

async function press(cdp: Cdp, key: string, code = key): Promise<void> {
  const keyCode = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'End' ? 35 : 0;
  const text = key === 'Enter' ? '\r' : undefined;
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: keyCode });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
}

async function main(): Promise<void> {
  // ZPLC_PACKAGED_DIST points at another output directory of electron-builder, for a package built outside the repository tree.
  // ZPLC_PACKAGED_EXECUTABLE points at the application that an installer or an archive left on this machine (REL-036).
  const installed = process.env.ZPLC_PACKAGED_EXECUTABLE;
  const executable = installed
    ? installedExecutable(installed)
    : discoverPackagedExecutable(process.env.ZPLC_PACKAGED_DIST ?? join(packageRoot, 'dist-electron'));
  // VF-008: the folder dialog test hook never ships. Checked on the archive itself, before anything is launched. The
  // portable Windows executable unpacks itself at run time, so it has no archive beside it to read.
  if (!installed || existsSync(packagedAsarPath(executable))) assertAsarHasNoDevOnlyCode(readFileSync(packagedAsarPath(executable)));
  const tempRoot = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
  const output: string[] = [];
  let electron: OwnedProcess | undefined;
  let cdp: Cdp | undefined;
  try {
    const cdpPort = await freePort();
    electron = Bun.spawn(
      [executable, '--headless', '--disable-gpu', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(tempRoot, 'profile')}`],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    drain(electron, output);
    const target = await waitFor('packaged file renderer target', async () => {
      const targets: Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }> = await fetch(
        `http://${HOST}:${cdpPort}/json/list`,
      )
        .then((response) => response.json() as Promise<Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>>)
        .catch(() => []);
      return targets.find((item) => item.type === 'page' && item.url?.startsWith('file:') && item.webSocketDebuggerUrl)
        ?.webSocketDebuggerUrl;
    });
    cdp = await Cdp.connect(target);
    await cdp.command('Runtime.enable');
    await cdp.command('Log.enable');
    await cdp.command('Page.enable');
    await cdp.command('Page.bringToFront');
    await cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    const identity = await waitFor(
      'packaged preload bridge',
      async () =>
        (await cdp!.evaluate(
          'window.electronAPI?.getAppInfo ? Promise.all([location.protocol, window.electronAPI.getAppInfo()]) : undefined',
        )) as [string, { isPackaged?: unknown; platform?: unknown; arch?: unknown }] | undefined,
    );
    assert(identity[0] === 'file:', `Packaged renderer origin is not file:: ${identity[0]}`);
    assert(
      identity[1].isPackaged === true && identity[1].platform === process.platform && identity[1].arch === process.arch,
      `Unexpected packaged preload app info: ${JSON.stringify(identity[1])}`,
    );
    await waitFor(
      'packaged Welcome screen',
      async () =>
        (await cdp!.evaluate(`(() => {
      const heading = document.querySelector('h1');
      const contrast = document.querySelector('select[data-theme-control]');
      return heading?.textContent === 'ZPLC' && contrast ? true : undefined;
    })()`)) as boolean | undefined,
    );
    const rendererBoundary = (await cdp.evaluate(`(() => ({
      node: ['process', 'require', 'module', 'Buffer'].map((key) => [key, typeof window[key]]),
      preload: Object.keys(window.electronAPI ?? {}).sort(),
      welcome: document.querySelector('h1')?.textContent === 'ZPLC',
    }))()`)) as { node: Array<[string, string]>; preload: string[]; welcome: boolean };
    assert(
      rendererBoundary.node.every(([, value]) => value === 'undefined'),
      `Node globals leaked into packaged renderer: ${JSON.stringify(rendererBoundary.node)}`,
    );
    assert(
      JSON.stringify(rendererBoundary.preload) === JSON.stringify(PACKAGED_PRELOAD_SURFACE),
      `Unexpected packaged preload surface: ${JSON.stringify(rendererBoundary.preload)}`,
    );
    assert(rendererBoundary.welcome, 'Packaged renderer did not render the folder-backed Welcome screen.');
    // IDE-001, IDE-003: the project bridge of the asar's preload offers exactly its typed operations (the eight file ones, the four of
    // recent projects, the watch and its event, and the three of the project archives) and no path-taking helper; the session bridge, its
    // two.
    const projectOperations = (await cdp.evaluate(`Object.keys(window.electronAPI.projectFiles).sort()`)) as string[];
    assert(
      JSON.stringify(projectOperations) ===
        JSON.stringify([
          'chooseFolder',
          'exportArchive',
          'extractArchive',
          'forgetRecent',
          'inspectArchive',
          'list',
          'listRecent',
          'markOpened',
          'mkdir',
          'onChanged',
          'openRecent',
          'read',
          'remove',
          'rename',
          'stat',
          'watch',
          'write',
        ]),
      `Unexpected packaged project bridge: ${JSON.stringify(projectOperations)}`,
    );
    const sessionOperations = (await cdp.evaluate(`Object.keys(window.electronAPI.session).sort()`)) as string[];
    assert(
      JSON.stringify(sessionOperations) === JSON.stringify(['load', 'save']),
      `Unexpected packaged session bridge: ${JSON.stringify(sessionOperations)}`,
    );
    // REL-025: the firmware bridge has its one typed listing, and what it answers is a valid answer. When the package was made
    // with the firmware set at hand (ZPLC_REQUIRE_FIRMWARE=1) the two learner-board images are inside it, with their checksums.
    const firmwareOperations = (await cdp.evaluate(`Object.keys(window.electronAPI.firmwareImages).sort()`)) as string[];
    assert(
      JSON.stringify(firmwareOperations) === JSON.stringify(['list']),
      `Unexpected packaged firmware bridge: ${JSON.stringify(firmwareOperations)}`,
    );
    const firmware = parseFirmwareImagesResult(await cdp.evaluate(`window.electronAPI.firmwareImages.list()`));
    assert(firmware !== null, 'The packaged firmware bridge answered something that is not a firmware answer.');
    if (process.env.ZPLC_REQUIRE_FIRMWARE === '1') {
      const learners = firmware.status === 'available' ? firmware.images.filter((image) => image.learner && image.role === 'flash') : [];
      assert(
        firmware.status === 'available' && learners.length === 2 && learners.every((image) => image.bundled === 'verified'),
        `The packaged application does not hold the two learner-board images with their checksums: ${JSON.stringify(firmware)}`,
      );
    }
    // LX-1: the workspace test bridge registers the folder the main process owns by its opaque id, next to the older file-based
    // registration.
    const workspaceTestOperations = (await cdp.evaluate(`Object.keys(window.electronAPI.workspaceTests).sort()`)) as string[];
    assert(
      ['registerProjectFile', 'registerProjectRoot'].every((operation) => workspaceTestOperations.includes(operation)),
      `Packaged workspace test bridge lacks registerProjectRoot: ${JSON.stringify(workspaceTestOperations)}`,
    );
    // The permission handlers stay deny-by-default: a request other than serial is refused, and the file system permission goes through the
    // same handlers.
    const permissionProbe = (await cdp.evaluate(
      `Notification.requestPermission().then((requested) => ({ requested, now: Notification.permission }))`,
    )) as { requested: string; now: string };
    assert(
      permissionProbe.requested === 'denied' && permissionProbe.now === 'denied',
      `A permission request must be refused in the packaged app: ${JSON.stringify(permissionProbe)}`,
    );
    // IDE-005: no reload or developer-tools entry exists in a packaged build. Key events injected over the DevTools protocol
    // never reach native menus, so the app reports the roles and accelerators it registered and the smoke reads that line.
    const menuReport = await waitFor('packaged application menu report', async () =>
      output
        .join('')
        .split('\n')
        .find((line) => line.includes('[zplc] application menu')),
    );
    const reported = /roles=(\S*) accelerators=(\S*)/.exec(menuReport);
    assert(reported && reported[1].length > 0, `Unreadable packaged application menu report: ${menuReport}`);
    const registeredRoles = reported[1].split(',').map((role) => role.toLowerCase());
    const registeredAccelerators = reported[2].split(',').filter(Boolean);
    assert(
      ['reload', 'forcereload', 'toggledevtools'].every((role) => !registeredRoles.includes(role)),
      `Packaged application menu has a reload or developer-tools entry: ${menuReport}`,
    );
    assert(
      !registeredAccelerators.some(isReloadOrDevToolsAccelerator),
      `Packaged application menu has a reload or developer-tools accelerator: ${menuReport}`,
    );
    const closeGuard = (await cdp.evaluate(
      `(async () => { const guard = window.electronAPI.closeGuard; return { keys: Object.keys(guard).sort(), accepted: await ` +
        `guard.setDirty(false).then(() => true, () => false), rejected: await guard.setDirty('yes').then(() => false, () => true) }; })()`,
    )) as { keys: string[]; accepted: boolean; rejected: boolean };
    assert(
      JSON.stringify(closeGuard.keys) === JSON.stringify(['closeNow', 'onCloseRequested', 'setDirty']) &&
        closeGuard.accepted &&
        closeGuard.rejected,
      `Packaged close guard bridge is not narrow and validated: ${JSON.stringify(closeGuard)}`,
    );
    // IDE-018: the port-choice bridge is two typed calls and the push of the offer; a message that is not exactly an answer is refused.
    const portChoice = (await cdp.evaluate(
      `(async () => { const bridge = window.electronAPI.portChoice; return { keys: Object.keys(bridge).sort(), rejected: await ` +
        `bridge.choose({ requestId: 'r', portId: '/dev/ttyUSB0', path: '/dev/ttyUSB0' }).then(() => false, () => true), unknownRequest: ` +
        `await bridge.list({ requestId: 'no-such-request' }).then((value) => value, () => 'refused') }; })()`,
    )) as { keys: string[]; rejected: boolean; unknownRequest: unknown };
    assert(
      JSON.stringify(portChoice.keys) === JSON.stringify(['choose', 'list', 'onRequested']) &&
        portChoice.rejected &&
        portChoice.unknownRequest === null,
      `Packaged port-choice bridge is not narrow and validated: ${JSON.stringify(portChoice)}`,
    );
    assert(
      await cdp.evaluate(
        `(() => { const control = document.querySelector('select[data-theme-control]'); control?.focus(); return Boolean(control && ` +
          `document.activeElement === control && control.matches(':focus-visible') && getComputedStyle(control).outlineStyle !== ` +
          `'none'); })()`,
      ),
      'Packaged Welcome theme control is not keyboard focusable.',
    );
    await press(cdp, 'End'); // the last option of the theme select is High contrast
    await waitFor('packaged high-contrast keyboard activation', async () =>
      (await cdp!.evaluate(
        `document.documentElement.classList.contains('high-contrast') && getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, ` +
          `0)'`,
      )) === true
        ? true
        : undefined,
    );
    const targetCount = (
      (await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json())) as Array<{ type?: string }>
    ).filter((item) => item.type === 'page').length;
    const navigation = (await cdp.evaluate(
      `(() => { const href = location.href; const opened = window.open('https://example.invalid/zplc-packaged-smoke'); return { href, ` +
        `sameDocument: location.href === href, opened: opened === null }; })()`,
    )) as { sameDocument: boolean; opened: boolean };
    await Bun.sleep(100);
    const targetCountAfterOpen = (
      (await fetch(`http://${HOST}:${cdpPort}/json/list`).then((response) => response.json())) as Array<{ type?: string }>
    ).filter((item) => item.type === 'page').length;
    assert(
      navigation.sameDocument && navigation.opened && targetCountAfterOpen === targetCount,
      'Packaged renderer opened a new window or navigated away from its file:// document.',
    );
    await Bun.sleep(250);
    const frame = (await cdp.command('Page.getFrameTree')) as { frameTree?: { frame?: { id?: string } } };
    const version = JSON.parse(await Bun.file(join(packageRoot, 'node_modules', 'electron', 'package.json')).text()).version as string;
    assert(
      isElectronHeadlessBootstrapQuarantine(version, cdp.errorDetails, frame.frameTree?.frame?.id ?? ''),
      `Unexpected renderer diagnostics: ${cdp.errorDetails.join(' | ')}`,
    );
    void cdp.command('Browser.close').catch(() => undefined);
    const exitCode = await Promise.race([electron.exited, Bun.sleep(3_000).then(() => null)]);
    cdp.close();
    cdp = undefined;
    assert(exitCode === 0, `Packaged Electron did not exit cleanly: ${exitCode}`);
    console.log(
      `Packaged ${process.platform}/${process.arch} Electron launch smoke passed through file:// preload IPC. Host/package evidence ` +
        `only; not installer, HIL, or hardware evidence.`,
    );
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-12_000)}`);
  } finally {
    if (cdp) await cdp.command('Browser.close').catch(() => undefined);
    cdp?.close();
    await stop(electron);
    if (tempRoot.startsWith(join(tmpdir(), 'zplc-packaged-smoke-')) && existsSync(tempRoot)) {
      // The portable Windows executable runs the application as a child that can hold the profile a moment after the
      // launcher has exited (EBUSY): a folder left in the temporary directory is not a failed launch, and an error thrown
      // here would hide the smoke's own result.
      try {
        rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch (error) {
        console.warn(`The smoke could not remove ${tempRoot}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

if (import.meta.main) await main();
