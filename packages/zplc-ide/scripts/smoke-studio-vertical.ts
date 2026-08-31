/**
 * Studio vertical smoke. It mocks only the Electron workspace-test bridge;
 * the approved result comes from the real native POSIX Tool API.
 */
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { compilerCompile, testsRun, type CompilerCompileResult, type TestRunResult } from '../src/cli/toolApi';

const HOST = '127.0.0.1';
const TIMEOUT_MS = 15_000;

type OwnedProcess = ReturnType<typeof Bun.spawn>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function executable(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try { accessSync(path, constants.X_OK); return path; } catch { return undefined; }
}

function chromium(): string {
  const explicit = executable(process.env.ZPLC_CHROMIUM_BIN) ?? executable(process.env.CHROME_BIN);
  if (explicit) return explicit;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }
  throw new Error('Chrome/Chromium not found. Set ZPLC_CHROMIUM_BIN to an executable browser path.');
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

async function stop(process: OwnedProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  process.kill();
  await Promise.race([process.exited, Bun.sleep(3_000)]);
  if (process.exitCode === null) { process.kill('SIGKILL'); await process.exited; }
}

class Cdp {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  readonly errors: string[] = [];

  #rejectPending(error: Error): void { for (const pending of this.#pending.values()) pending.reject(error); this.#pending.clear(); }

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: { exceptionDetails?: { text?: string; exception?: { description?: string } }; entry?: { level?: string; text?: string }; type?: string; args?: Array<{ value?: unknown; description?: string }> } };
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
    socket.addEventListener('close', () => this.#rejectPending(new Error('CDP WebSocket closed')));
    socket.addEventListener('error', () => this.#rejectPending(new Error('CDP WebSocket failed')));
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
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Page evaluation failed');
    return result.result?.value;
  }

  close(): void { this.#socket.close(); }
}

async function captureWelcomeReviewScreens(cdp: Cdp, reviewDir: string): Promise<void> {
  mkdirSync(reviewDir, { recursive: true });
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { window.__zplcSmoke = { ...window.__zplcSmoke, welcomeTheme: useIDEStore.getState().theme }; })`);
  const originalTheme = await waitFor('welcome review theme', async () => {
    const theme = await cdp.evaluate('window.__zplcSmoke?.welcomeTheme');
    return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : undefined;
  });
  const setTheme = async (theme: 'light' | 'dark') => {
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${theme}'))`);
    await waitFor(`${theme} welcome theme`, async () => await cdp.evaluate(`document.documentElement.classList.contains('${theme}') ? true : undefined`) === true ? true : undefined);
  };
  const screenshot = async (name: string) => {
    const result = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as { data?: string };
    assert(typeof result.data === 'string' && result.data.length > 0, `Welcome screenshot ${name} was not returned`);
    writeFileSync(join(reviewDir, name), Buffer.from(result.data, 'base64'));
  };

  for (const [theme, width] of [['light', 1366], ['dark', 1366], ['light', 1024], ['dark', 1024]] as const) {
    await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 768, deviceScaleFactor: 1, mobile: false });
    await waitFor(`${width} welcome viewport`, async () => await cdp.evaluate(`window.innerWidth === ${width} && window.innerHeight === 768 ? true : undefined`) === true ? true : undefined);
    await setTheme(theme);
    await Bun.sleep(250);
    const valid = await cdp.evaluate(`(() => {
      const controls = [...document.querySelectorAll('button')];
      const matches = ['Open project', 'New project'].map((label) => controls.find((button) => button.textContent?.includes(label)));
      const exampleHeading = [...document.querySelectorAll('h3')].find((heading) => heading.textContent?.trim() === 'Copy example');
      const h1 = [...document.querySelectorAll('h1')].find((heading) => heading.textContent?.trim() === 'ZPLC Studio 2.0');
      const examples = [...document.querySelectorAll('button[data-welcome-example]')];
      const visible = [...matches, document.querySelector('button[aria-label^="Switch to"]')].every((element) => {
        const rect = element?.getBoundingClientRect();
        return Boolean(rect) && rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      const example = examples[0];
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--color-surface-900);color:var(--text-primary)';
      document.body.append(probe);
      const expected = getComputedStyle(probe);
      const exampleStyle = example && getComputedStyle(example);
      const settledTheme = Boolean(exampleStyle) && exampleStyle.backgroundColor === expected.backgroundColor && exampleStyle.color === expected.color;
      probe.remove();
      return Boolean(h1) && Boolean(exampleHeading) && matches.every(Boolean) && examples.length > 0 && examples.every((button) => !button.disabled) && settledTheme && document.body.innerText.includes('Choose or create a destination folder') && document.body.innerText.includes('The copy stops if a destination file already exists') && !document.body.innerText.includes('Temporary project') && document.body.scrollWidth <= window.innerWidth && visible;
    })()`);
    assert(valid === true, `Welcome ${theme} ${width}x768 is clipped or missing a folder-backed start path`);
    await screenshot(`welcome-${theme}-${width}.png`);
  }
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${originalTheme}'))`);
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
}

async function captureReviewScreens(cdp: Cdp, reviewDir: string): Promise<void> {
  mkdirSync(reviewDir, { recursive: true });
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { window.__zplcSmoke.reviewTheme = useIDEStore.getState().theme; })`);
  const originalTheme = await waitFor('review theme', async () => {
    const theme = await cdp.evaluate('window.__zplcSmoke?.reviewTheme');
    return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : undefined;
  });
  const setTheme = async (theme: 'light' | 'dark') => {
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${theme}'))`);
    await waitFor(`${theme} review theme`, async () => await cdp.evaluate(`document.documentElement.classList.contains('${theme}') ? true : undefined`) === true ? true : undefined);
  };
  const assertReviewFrame = async (width: number, requireRun: boolean) => {
    const valid = await cdp.evaluate(`(() => {
      const viewport = window.innerWidth;
      const required = [document.querySelector('[aria-label="Workbench panels"]'), document.querySelector('button[aria-label="Inspector"]'), document.querySelector('[aria-label="Operational status"]')];
      const inViewport = required.every((element) => { const rect = element?.getBoundingClientRect(); return Boolean(rect) && rect.left >= 0 && rect.right <= viewport && rect.top >= 0 && rect.bottom <= window.innerHeight; });
      const truthRail = document.querySelector('[aria-label="Operational status"]')?.getBoundingClientRect();
      const controls = !${requireRun} || Boolean(document.querySelector('button[aria-label="Disconnect"]') && document.querySelector('button[aria-label="Run (F5)"]'));
      return document.body.scrollWidth <= viewport && inViewport && truthRail && truthRail.height >= 34 && controls;
    })()`);
    assert(valid === true, `Review frame ${width}x768 is clipped or missing required workbench controls`);
  };
  const screenshot = async (name: string) => {
    const result = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as { data?: string };
    assert(typeof result.data === 'string' && result.data.length > 0, `Review screenshot ${name} was not returned`);
    writeFileSync(join(reviewDir, name), Buffer.from(result.data, 'base64'));
  };

  // Run is deliberately conditional on a connected simulator in the existing toolbar.
  await cdp.evaluate(`window.electronAPI.nativeSimulation = { startSession: async () => ({ protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: 'smoke', capability_profile: { profile_id: 'smoke-review', features: [{ name: 'pause', status: 'supported' }, { name: 'resume', status: 'supported' }, { name: 'step', status: 'supported' }] } }), stopSession: async () => undefined, request: async () => ({}) };`);
  await cdp.evaluate(`document.querySelector('button[aria-label="Connect"]')?.click()`);
  await waitFor('simulator controls for review', async () => await cdp.evaluate(`document.querySelector('button[aria-label="Disconnect"]') && document.querySelector('button[aria-label="Run (F5)"]') ? true : undefined`) === true ? true : undefined);
  for (const [theme, width] of [['light', 1366], ['dark', 1366], ['light', 1024], ['dark', 1024]] as const) {
    await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 768, deviceScaleFactor: 1, mobile: false });
    await waitFor(`${width} review viewport`, async () => await cdp.evaluate(`window.innerWidth === ${width} && window.innerHeight === 768 ? true : undefined`) === true ? true : undefined);
    await setTheme(theme);
    await assertReviewFrame(width, width === 1024);
    await screenshot(`${theme}-${width}.png`);
  }
  await cdp.evaluate(`document.querySelector('button[aria-label="Explorer"]')?.click()`);
  await waitFor('review Explorer lower panel', async () => await cdp.evaluate(`Boolean(document.querySelector('#console-panel-explorer [role="tree"]')) ? true : undefined`) === true ? true : undefined);
  assert(await cdp.evaluate(`(() => { const panel = document.getElementById('console-panel-explorer')?.getBoundingClientRect(); const editor = document.getElementById('editor-panel')?.getBoundingClientRect(); return Boolean(panel && editor && panel.top >= editor.bottom); })()`) === true, 'Explorer must live in the lower ledger');
  await screenshot('explorer-ledger-1024.png');
  for (const [kind, fileId] of [['fbd', 'blinky-fbd'], ['ld', 'blinky-ld'], ['sfc', 'blinky-sfc']] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await setTheme(theme);
      await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { useIDEStore.getState().setDebugMode('none'); useIDEStore.getState().setActiveFile('${fileId}'); })`);
      await waitFor(`${kind} visual editor`, async () => await cdp.evaluate(`document.querySelector('.zplc-visual-editor') ? true : undefined`) === true ? true : undefined);
      await Bun.sleep(250); // Capture the settled palette, not the 200 ms theme transition.
      assert(await cdp.evaluate(`(() => { const editor = document.getElementById('editor-panel')?.getBoundingClientRect(); const visual = document.querySelector('.zplc-visual-editor')?.getBoundingClientRect(); return Boolean(editor && visual && visual.width > 0 && visual.height > 0 && editor.right <= window.innerWidth); })()`) === true, `${kind} visual editor is clipped`);
      if (theme === 'dark' && kind !== 'ld') assert(await cdp.evaluate(`(() => { const button = document.querySelector('.zplc-visual-editor .react-flow__controls-button'); const panel = document.querySelector('.zplc-visual-editor .react-flow__controls'); const icon = button?.querySelector('svg'); if (!button || !panel || !icon) return false; const buttonStyle = getComputedStyle(button); return buttonStyle.backgroundColor === getComputedStyle(panel).backgroundColor && getComputedStyle(icon).fill !== buttonStyle.backgroundColor; })()`) === true, `${kind} dark controls must inherit the visual panel surface with a legible icon`);
      if (kind === 'fbd') assert(await cdp.evaluate(`(() => { const nodes = ['var_led_read', 'not_enable', 'ton_timer', 'output_led'].map((id) => document.querySelector('.react-flow__node[data-id="' + id + '"]')); const rects = nodes.map((node) => node?.getBoundingClientRect()); return rects.every(Boolean) && rects.slice(1).every((rect, index) => rect.left - rects[index].right >= 12) && nodes.every((node) => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)'); })()`) === true, 'FBD cards must leave visible wire gaps inside transparent node shells');
      if (kind === 'sfc') assert(await cdp.evaluate(`(() => { const toolbox = document.querySelector('.zplc-visual-toolbox'); const step = document.querySelector('.sfc-step-box'); const label = step?.querySelector('span'); if (!toolbox || !step || !label) return false; const channels = (value) => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number); const luminance = (value) => channels(value).map((channel) => channel / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0); const foreground = luminance(getComputedStyle(label).color); const background = luminance(getComputedStyle(step).backgroundColor); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5; })()`) === true, `SFC ${theme} must expose an editable toolbox and a WCAG AA step label`);
      if (kind === 'sfc') assert(await cdp.evaluate(`(() => { const steps = ['step_led_on', 'step_led_off'].map((id) => document.querySelector('.react-flow__node[data-id="' + id + '"] .sfc-step-box')); const [initial, regular] = steps.map((step) => step?.getBoundingClientRect()); const actions = ['step_led_on', 'step_led_off'].map((id) => document.querySelector('.react-flow__node[data-id="' + id + '"] [data-sfc-actions]')?.getBoundingClientRect()); const footer = [...document.querySelectorAll('.sfc-step-box *')].some((element) => element.textContent?.trim() === 'INITIAL'); return Boolean(initial && regular && actions.every(Boolean)) && getComputedStyle(steps[0]).borderStyle === 'double' && getComputedStyle(steps[1]).borderStyle !== 'double' && initial.width <= 120 && initial.height <= 56 && Math.abs(initial.width - regular.width) < 1 && Math.abs(initial.height - regular.height) < 1 && actions.every((action, index) => Math.abs(action.top + action.height / 2 - ([initial, regular][index].top + [initial, regular][index].height / 2)) < 2) && !footer; })()`) === true, 'SFC steps must share compact geometry, use a double initial border, and center every action without an INITIAL footer');
      if (kind === 'sfc') { const layout = await cdp.evaluate(`(() => { const nodes = (ids) => ids.map((id) => document.querySelector('.react-flow__node[data-id="' + id + '"]')); const [firstStep, secondStep] = nodes(['step_led_on', 'step_led_off']); const [firstTransition, secondTransition] = nodes(['trans_on_to_off', 'trans_off_to_on']); const steps = [firstStep, secondStep].map((node) => node?.querySelector('.sfc-step-box')?.getBoundingClientRect()); const transitions = [firstTransition, secondTransition].map((node) => node?.getBoundingClientRect()); const guards = [firstTransition, secondTransition].map((node) => node?.querySelector('[data-sfc-guard]')?.getBoundingClientRect()); const actions = [firstStep, secondStep].map((node) => node?.querySelector('[data-sfc-actions]')?.getBoundingClientRect()); const bars = [firstTransition, secondTransition].map((node) => node?.querySelector('[title]')?.getBoundingClientRect()); const transitionHandles = [firstTransition, secondTransition].map((node) => [...node.querySelectorAll('.react-flow__handle')].map((handle) => handle.getBoundingClientRect())); const forward = [...document.querySelectorAll('.sfc-edge-forward')]; const returning = [...document.querySelectorAll('.sfc-edge-return')]; const handles = [...document.querySelectorAll('.sfc-step-node .react-flow__handle, .sfc-transition-node .react-flow__handle')]; const noOverlap = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top; const forwardAligned = forward.length === 3 && forward.every((edge) => { const path = edge.getAttribute('d') ?? ''; return path.split('L').length === 2 && !edge.getAttribute('marker-end'); }); const returnLane = returning.length === 1 && Boolean(returning[0].getAttribute('marker-end')) && Number(returning[0].getAttribute('data-sfc-return-lane')) < steps[0].left && Number(returning[0].getAttribute('data-sfc-return-lane')) < steps[1].left; const annotationsClear = guards.every(Boolean) && actions.every(Boolean) && guards.every((guard, index) => noOverlap(guard, actions[index])); const flowClear = steps.every(Boolean) && transitions.every(Boolean) && steps[0].bottom < transitions[0].top && transitions[0].bottom < steps[1].top && steps[1].bottom < transitions[1].top; const guardPlain = [...document.querySelectorAll('[data-sfc-guard]')].every((guard) => { const style = getComputedStyle(guard); return style.borderWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)'; }); const axisAligned = bars.every(Boolean) && transitions.every(Boolean) && bars.every((bar, index) => Math.abs(bar.left + bar.width / 2 - (transitions[index].left + transitions[index].width / 2)) < 2 && Math.abs(bar.top + bar.height / 2 - (transitions[index].top + transitions[index].height / 2)) < 3 && transitionHandles[index].every((handle) => Math.abs(handle.left + handle.width / 2 - (transitions[index].left + transitions[index].width / 2)) < 2)); return forwardAligned && returnLane && annotationsClear && flowClear && guardPlain && axisAligned && handles.length > 0 && handles.every((handle) => getComputedStyle(handle).opacity === '0'); })()`); assert(layout === true, 'SFC must render an aligned IEC spine with unmarked forward flow, a marked left return lane, plain guards, and hidden resting handles'); }
      await screenshot(`${kind}-${theme}-1366.png`);
    }
  }
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1672, height: 941, deviceScaleFactor: 1, mobile: false });
  await waitFor('hero review viewport', async () => await cdp.evaluate('window.innerWidth === 1672 && window.innerHeight === 941 ? true : undefined') === true ? true : undefined);
  await setTheme('dark');
  await assertReviewFrame(1672, false);
  await screenshot('hero-repro.png');
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await waitFor('forced colors media', async () => await cdp.evaluate("matchMedia('(forced-colors: active)').matches ? true : undefined") === true ? true : undefined);
  await waitFor('forced colors viewport', async () => await cdp.evaluate('window.innerWidth === 1024 && window.innerHeight === 768 ? true : undefined') === true ? true : undefined);
  await assertReviewFrame(1024, true);
  await screenshot('forced-colors-1024.png');
  await cdp.command('Emulation.setEmulatedMedia', { features: [] });
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${originalTheme}'))`);
  await waitFor('restored review theme', async () => await cdp.evaluate(`useTheme => document.documentElement.classList.contains('light') === ${originalTheme === 'light'} && document.documentElement.classList.contains('dark') === ${originalTheme === 'dark'} ? true : undefined`.replace('useTheme => ', '')) === true ? true : undefined);
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await waitFor('restored review viewport', async () => await cdp.evaluate('window.innerWidth === 1366 && window.innerHeight === 768 ? true : undefined') === true ? true : undefined);
}

async function captureLearnReviewScreens(cdp: Cdp, reviewDir: string): Promise<void> {
  mkdirSync(reviewDir, { recursive: true });
  const original = await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => ({ theme: useIDEStore.getState().theme, tab: useIDEStore.getState().activeConsoleTab }))`) as { theme: 'light' | 'dark' | 'system'; tab: string };
  const setTheme = async (theme: 'light' | 'dark') => {
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${theme}'))`);
    await waitFor(`${theme} Learn theme`, async () => await cdp.evaluate(`document.documentElement.classList.contains('${theme}') ? true : undefined`) === true ? true : undefined);
  };
  const screenshot = async (name: string) => {
    const result = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as { data?: string };
    assert(typeof result.data === 'string' && result.data.length > 0, `Learn screenshot ${name} was not returned`);
    writeFileSync(join(reviewDir, name), Buffer.from(result.data, 'base64'));
  };
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setActiveConsoleTab('learn'))`);
  await waitFor('Learn panel', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Arranque y parada seguros') ? true : undefined`) === true ? true : undefined);
  const assertLesson = async (title: string, copy: string, details = 6) => assert(await cdp.evaluate(`(() => { const panel = document.getElementById('console-panel-learn'); const controls = [...document.querySelectorAll('#console-panel-learn button')]; return Boolean(panel) && document.body.scrollWidth <= window.innerWidth && panel.textContent?.includes(${JSON.stringify(title)}) && controls.some((button) => button.textContent?.includes(${JSON.stringify(copy)})) && [...document.querySelectorAll('#console-panel-learn details')].length === ${details}; })()`) === true, `Learn ${title} is clipped or incomplete`);
  const selectLesson = async (label: string) => {
    assert(await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)}); if (!button || button.disabled) return false; button.click(); return true; })()`) === true, `Learn lesson selector ${label} is unavailable`);
  };
  await assertLesson('Arranque y parada seguros', 'Copiar ejemplo Arranque y parada seguros');
  await selectLesson('Cruce peatonal y estados seguros');
  await waitFor('Spanish pedestrian Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Cruce peatonal y estados seguros') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Cruce peatonal y estados seguros', 'Copiar ejemplo Cruce peatonal y estados seguros');
  await screenshot('learn-pedestrian-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('English pedestrian Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Pedestrian crossing and safe states') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Pedestrian crossing and safe states', 'Copy Pedestrian crossing and safe states example');
  await screenshot('learn-pedestrian-en-1366.png');
  await selectLesson('Tank level, faults, and reset');
  await waitFor('English tank Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Tank level, faults, and reset') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Tank level, faults, and reset', 'Copy Tank level, faults, and reset example');
  await screenshot('learn-tank-en-1366.png');
  await selectLesson('Conveyor classification and safe jam');
  await waitFor('English conveyor Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Conveyor classification and safe jam') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Conveyor classification and safe jam', 'Copy Conveyor classification and safe jam example');
  await screenshot('learn-conveyor-en-1366.png');
  await selectLesson('Reproducible diagnosis: two parts, one decision');
  await waitFor('English two-parts conveyor Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Reproducible diagnosis: two parts, one decision') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Reproducible diagnosis: two parts, one decision', 'Copy Reproducible diagnosis: two parts, one decision example');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('AT@30 Belt=true/Diverter=true, AT@70 Belt=true/Diverter=false') && document.getElementById('console-panel-learn')?.textContent?.includes('Tests provide native POSIX host runtime evidence with scenario-scheduled inputs; they are not physical sensors or parts, target timing, hardware, HIL, or certification evidence.')`) === true, 'English two-parts conveyor Learn calendar or host-only scope is missing');
  await screenshot('learn-conveyor-two-parts-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('Spanish two-parts conveyor Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Diagnóstico reproducible: dos piezas, una decisión') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Diagnóstico reproducible: dos piezas, una decisión', 'Copiar ejemplo Diagnóstico reproducible: dos piezas, una decisión');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('AT@30 Belt=true/Diverter=true, AT@70 Belt=true/Diverter=false') && document.getElementById('console-panel-learn')?.textContent?.includes('La evidencia de Tests es del runtime nativo POSIX host con inputs programados por escenario; no es evidencia de sensores ni piezas físicas, timing de target, hardware, HIL ni certificación.')`) === true, 'Spanish two-parts conveyor Learn calendar or host-only scope is missing');
  await screenshot('learn-conveyor-two-parts-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('restored English two-parts conveyor Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Reproducible diagnosis: two parts, one decision') ? true : undefined`) === true ? true : undefined);
  await selectLesson('Ladder, TON, and output feedback');
  await waitFor('English Blinky Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Ladder, TON, and output feedback') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Ladder, TON, and output feedback', 'Copy Ladder, TON, and output feedback example');
  await screenshot('learn-blinky-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('Spanish Blinky Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Ladder, TON y realimentación de salida') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Ladder, TON y realimentación de salida', 'Copiar ejemplo Ladder, TON y realimentación de salida');
  await screenshot('learn-blinky-es-1366.png');
  await selectLesson('Comando, realimentación y velocidad');
  await waitFor('Spanish motor plant Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Comando, realimentación y velocidad') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Comando, realimentación y velocidad', 'Copiar ejemplo Comando, realimentación y velocidad');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('La evidencia de Tests es determinística del host nativo POSIX y de la planta discreta; no es evidencia de motor físico, hardware, HIL ni certificación.')`) === true, 'Spanish Motor Plant Learn scope is not host-only');
  await screenshot('learn-motor-plant-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('English motor plant Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Command, feedback, and speed') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Command, feedback, and speed', 'Copy Command, feedback, and speed example');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Tests provide deterministic native POSIX host and discrete-plant evidence only; they are not physical-motor, hardware, HIL, or certification evidence.')`) === true, 'English Motor Plant Learn scope is not host-only');
  await screenshot('learn-motor-plant-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('restored Spanish motor plant Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Comando, realimentación y velocidad') ? true : undefined`) === true ? true : undefined);
  await selectLesson('Flancos y contador de pulsos');
  await waitFor('Spanish edge counter Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Flancos y contador de pulsos') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Flancos y contador de pulsos', 'Copiar ejemplo Flancos y contador de pulsos');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('La evidencia de Tests es del host nativo POSIX; no es evidencia de sensor físico, rebote, hardware, HIL ni certificación.')`) === true, 'Spanish Edge Counter Learn scope is not host-only');
  await screenshot('learn-edge-counter-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('English edge counter Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Edges and pulse counter') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Edges and pulse counter', 'Copy Edges and pulse counter example');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Tests provide native POSIX host evidence only; they are not physical-sensor, bounce, hardware, HIL, or certification evidence.')`) === true, 'English Edge Counter Learn scope is not host-only');
  await screenshot('learn-edge-counter-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('restored Spanish edge counter Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Flancos y contador de pulsos') ? true : undefined`) === true ? true : undefined);
  await selectLesson('Ciclo de scan y memoria de un ciclo');
  await waitFor('Spanish scan snapshot Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Ciclo de scan y memoria de un ciclo') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Ciclo de scan y memoria de un ciclo', 'Copiar ejemplo Ciclo de scan y memoria de un ciclo', 7);
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('La evidencia de Tests es del runtime nativo POSIX host con una única tarea de 10 ms; no demuestra timing de target, snapshot bajo interrupciones físicas, rebote eléctrico, HIL ni certificación.')`) === true, 'Spanish Scan Snapshot Learn scope is not host-only');
  await screenshot('learn-scan-snapshot-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('English scan snapshot Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Scan cycle and one-scan memory') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Scan cycle and one-scan memory', 'Copy Scan cycle and one-scan memory example', 7);
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Tests provide native POSIX host runtime evidence with one 10 ms task; they do not establish target timing, snapshots under physical interrupts, electrical bounce, HIL, or certification.')`) === true, 'English Scan Snapshot Learn scope is not host-only');
  await screenshot('learn-scan-snapshot-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('restored Spanish scan snapshot Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Ciclo de scan y memoria de un ciclo') ? true : undefined`) === true ? true : undefined);
  await selectLesson('Assertions temporales y falla por atasco');
  await waitFor('Spanish temporal assertions Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Assertions temporales y falla por atasco') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Assertions temporales y falla por atasco', 'Copiar ejemplo Assertions temporales y falla por atasco');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('La evidencia de Tests es del runtime nativo POSIX host y de la planta discreta; el atasco inyectado no es una falla física, despeje físico, timing de target, HIL ni certificación.')`) === true, 'Spanish temporal assertions Learn scope is not host-only');
  await screenshot('learn-temporal-assertions-es-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'English'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('English temporal assertions Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Temporal assertions and jam fault') ? true : undefined`) === true ? true : undefined);
  await assertLesson('Temporal assertions and jam fault', 'Copy Temporal assertions and jam fault example');
  assert(await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Tests provide native POSIX host runtime and discrete-plant evidence only; the injected jam is not a physical fault, physical clearance, target timing, HIL, or certification evidence.')`) === true, 'English temporal assertions Learn scope is not host-only');
  await screenshot('learn-temporal-assertions-en-1366.png');
  await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('#console-panel-learn button')].find((item) => item.textContent?.trim() === 'Español'); if (!button || button.disabled) return false; button.click(); return true; })()`);
  await waitFor('restored Spanish temporal assertions Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Assertions temporales y falla por atasco') ? true : undefined`) === true ? true : undefined);
  await selectLesson('Arranque y parada seguros');
  await waitFor('restored Spanish motor Learn lesson', async () => await cdp.evaluate(`document.getElementById('console-panel-learn')?.textContent?.includes('Arranque y parada seguros') ? true : undefined`) === true ? true : undefined);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(theme);
    await Bun.sleep(250);
    await assertLesson('Arranque y parada seguros', 'Copiar ejemplo Arranque y parada seguros');
    assert(await cdp.evaluate(`(() => [...document.querySelectorAll('#console-panel-learn button')].some((button) => button.textContent?.includes('Abrir Tests')))()`) === true, `Learn ${theme} must expose Tests`);
    await screenshot(`learn-${theme}-1366.png`);
  }
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { useIDEStore.getState().setTheme('${original.theme}'); useIDEStore.getState().setActiveConsoleTab(${JSON.stringify(original.tab)}); })`);
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
}

async function captureRecordedPlantReviewScreens(cdp: Cdp, reviewDir: string, name: string, matrixLabel: string, recordedSelector = `[data-recorded-${name}-plant]`): Promise<void> {
  mkdirSync(reviewDir, { recursive: true });
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { window.__zplcSmoke.recordedPlantTheme = useIDEStore.getState().theme; })`);
  const originalTheme = await waitFor(`${name} review theme`, async () => {
    const theme = await cdp.evaluate('window.__zplcSmoke?.recordedPlantTheme');
    return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : undefined;
  });
  const setTheme = async (theme: 'light' | 'dark') => {
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${theme}'))`);
    await waitFor(`${theme} ${name} review theme`, async () => await cdp.evaluate(`document.documentElement.classList.contains('${theme}') ? true : undefined`) === true ? true : undefined);
  };
  const screenshot = async (name: string) => {
    const result = await cdp.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as { data?: string };
    assert(typeof result.data === 'string' && result.data.length > 0, `${name} screenshot was not returned`);
    writeFileSync(join(reviewDir, name), Buffer.from(result.data, 'base64'));
  };

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(theme);
    await cdp.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${matrixLabel}"]`)})?.scrollIntoView({ block: 'center', inline: 'nearest' })`);
    await Bun.sleep(250);
    assert(await cdp.evaluate(`(() => {
      const region = document.querySelector(${JSON.stringify(`[aria-label="${matrixLabel}"]`)});
      const plant = document.querySelector(${JSON.stringify(recordedSelector)});
      const rect = region?.getBoundingClientRect();
      const plantRect = plant?.getBoundingClientRect();
      const complete = ${name === 'conveyor'} ? ['Belt command', 'Diverter command', 'Fault lamp', 'Classified count', 'Classifier sensor', 'Metal sensor', 'Diverter sensor', 'Jam sensor', 'Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.'].every((label) => plant?.textContent?.includes(label))
        && Boolean(plantRect && plantRect.left >= 0 && plantRect.right <= window.innerWidth && plantRect.top >= 0 && plantRect.bottom <= window.innerHeight)
        : ${name === 'pedestrian'} ? ['Vehicle', 'Pedestrian', 'Request', 'Plant', 'Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.'].every((label) => plant?.textContent?.includes(label))
          && Boolean(plantRect && plantRect.left >= 0 && plantRect.right <= window.innerWidth && plantRect.top >= 0 && plantRect.bottom <= window.innerHeight)
          : ${name === 'tank'} ? ['Pump', 'Alarm', 'Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.'].every((label) => plant?.textContent?.includes(label))
            && Boolean(plantRect && plantRect.left >= 0 && plantRect.right <= window.innerWidth && plantRect.top >= 0 && plantRect.bottom <= window.innerHeight)
          : true;
      return Boolean(plant?.checkVisibility() && rect && rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight && document.body.scrollWidth <= window.innerWidth && region.scrollWidth >= region.clientWidth && complete);
    })()`) === true, `${name} ${theme} review frame is clipped or overflows the viewport`);
    await screenshot(`${name}-plant-${theme}-1366.png`);
  }
  await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme('${originalTheme}'))`);
}

const invalidProgram = 'PROGRAM Motor\n@\nEND_PROGRAM';
const reviewVisualSources = {
  fbd: readFileSync(join(import.meta.dir, '..', 'projects', 'blinky', 'src', 'main.fbd.json'), 'utf8'),
  ld: readFileSync(join(import.meta.dir, '..', 'projects', 'blinky', 'src', 'main.ld.json'), 'utf8'),
  sfc: readFileSync(join(import.meta.dir, '..', 'projects', 'blinky', 'src', 'main.sfc.json'), 'utf8'),
};

/** Serialize only the structured-clone payload exposed by the production IPC handler. */
function canonicalCompileEnvelope(result: CompilerCompileResult): Record<string, unknown> {
  if (!result.ok || !result.zplcFile || !result.bytecode || !result.assembly || !result.debugMap) {
    throw new Error('Golden canonical compile did not return its private artifact payload');
  }
  const zplcEvidence = result.evidence.artifacts.find((artifact) => artifact.kind === 'zplc');
  if (!zplcEvidence || zplcEvidence.byteLength !== result.zplcFile.byteLength) {
    throw new Error('Golden canonical compile evidence does not describe its .zplc artifact');
  }
  return {
    ok: true,
    summary: { name: result.summary.name, taskCount: result.summary.taskCount, codeSize: result.summary.codeSize },
    artifact: {
      zplcFile: Array.from(result.zplcFile),
      bytecode: Array.from(result.bytecode),
      assembly: result.assembly,
      debugMap: result.debugMap,
    },
    zplcEvidence,
  };
}

function pageSeed(passedResult: Extract<TestRunResult, { ok: true }>, compileEnvelope: Record<string, unknown>, initialProgram = invalidProgram, modified = true): string {
  return `(() => {
    const passed = ${JSON.stringify(passedResult)};
    const canonicalCompile = ${JSON.stringify(compileEnvelope)};
    canonicalCompile.artifact.zplcFile = new Uint8Array(canonicalCompile.artifact.zplcFile);
    canonicalCompile.artifact.bytecode = new Uint8Array(canonicalCompile.artifact.bytecode);
    const trace = passed.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
    const failed = () => ({ ok: false, evidence: { schemaVersion: 1, operation: 'test', outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/motor-start-stop.scenario.json' }], artifacts: passed.evidence.artifacts }, preview: { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256: trace.sha256, totalScenarioCount: 1, scenarios: [{ id: 'MotorStartStop', path: 'tests/motor-start-stop.scenario.json', passed: false, totalSamples: 2, totalSignals: 1, totalAssertions: 1, truncated: false, assertions: [{ kind: 'WITHIN', passed: false, atMs: 10 }], samples: [{ atMs: 0, outputs: { 'Motor.Forward': false } }, { atMs: 10, outputs: { 'Motor.Forward': false } }] }] } });
    const safety = () => ({ ok: true, summary: { configured: true, declared: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }], covered: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }], uncovered: [] }, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] } });
    const boardIds = ['rpi_pico', 'waveshare_rp2040_zero', 'nucleo_h743zi', 'stm32f746g_disco', 'arduino_giga_r1', 'esp32s3_devkitc'];
    const toolchain = (ready) => ({ ok: ready, summary: { scope: 'local-firmware-build-prerequisites', ready, checks: ['repository-manifest', 'west', 'python3', 'cmake', 'ninja', 'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain'].map((id) => ({ id, status: ready || id !== 'west' ? 'ready' : 'missing' })), boards: boardIds.map((ideId) => ({ ideId, zephyrBoard: ideId, validationLevel: 'cross-build' })) }, evidence: { schemaVersion: 1, operation: 'toolchain-inspect', outcome: ready ? 'passed' : 'failed', diagnostics: ready ? [] : [{ code: 'TOOLCHAIN_WEST_MISSING', message: 'Toolchain prerequisite is unavailable' }], artifacts: [] } });
    const build = () => ({ ok: true, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: { boardId: 'do-not-render', ideId: 'rpi_pico', zephyrBoard: 'rpi_pico', validationLevel: 'cross-build' }, artifact: { kind: 'firmware-elf', sha256: 'a'.repeat(64), byteLength: 52 }, output: { stdoutBytes: 0, stderrBytes: 0, truncated: false } }, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'passed', diagnostics: [], artifacts: [{ kind: 'firmware-elf', sha256: 'a'.repeat(64), byteLength: 52 }] } });
    const cancelled = () => ({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'failed', diagnostics: [{ code: 'FIRMWARE_BUILD_CANCELLED', message: 'Firmware build is unavailable' }], artifacts: [] } });
    window.__zplcSmoke = { mode: 'passed', toolchainReady: false, buildMode: 'success', deferToolchain: false, toolchainResult: toolchain, compileCalls: 0, registerCalls: 0, runRequests: [] };
    window.electronAPI = { isElectron: true, platform: 'linux', getAppInfo: async () => ({ version: 'smoke', platform: 'linux', arch: 'x64', isPackaged: false }), workspaceTests: { registerProjectFile: async (file) => { window.__zplcSmoke.registerCalls += 1; return file instanceof File && file.name === 'zplc.json' && file.size > 0 ? { workspaceId: 'opaque-workspace-capability' } : null; }, compile: async (request) => { window.__zplcSmoke.compileCalls += 1; return request?.workspaceId === 'opaque-workspace-capability' ? canonicalCompile : { ok: false, evidence: { outcome: 'failed', diagnostics: [], artifacts: [] } }; }, run: async (request) => { window.__zplcSmoke.runRequests.push(request); if (request?.workspaceId !== 'opaque-workspace-capability') return { ok: false, evidence: { outcome: 'failed', diagnostics: [], artifacts: [] } }; if (request?.scenarioId) return { ...passed, evidence: { ...passed.evidence, operation: 'scenario-run' } }; return window.__zplcSmoke.mode === 'failed' ? failed() : window.__zplcSmoke.mode === 'malformed' ? { ...passed, preview: { ...passed.preview, secret: 'do-not-render' } } : passed; }, safetyCheck: async (request) => request?.workspaceId === 'opaque-workspace-capability' ? window.__zplcSmoke.safetyMode === 'malformed' ? { ...safety(), secret: 'do-not-render' } : safety() : { ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'WORKSPACE_INVALID' }], artifacts: [] } }, cancel: async () => ({ requested: true }) }, toolchain: { inspect: async () => { window.__zplcSmoke.toolchainCalls = (window.__zplcSmoke.toolchainCalls || 0) + 1; if (window.__zplcSmoke.deferToolchain) return await new Promise((resolve) => { window.__zplcSmoke.resolveToolchain = resolve; }); return toolchain(window.__zplcSmoke.toolchainReady); } }, firmwareBuild: { start: async () => { window.__zplcSmoke.buildCalls = (window.__zplcSmoke.buildCalls || 0) + 1; if (window.__zplcSmoke.buildMode === 'malformed') return { ...build(), secret: 'do-not-render' }; if (window.__zplcSmoke.buildMode === 'active') return await new Promise((resolve) => { window.__zplcSmoke.resolveBuild = resolve; }); return build(); }, cancel: async () => { window.__zplcSmoke.cancelCalls = (window.__zplcSmoke.cancelCalls || 0) + 1; window.__zplcSmoke.resolveBuild?.(cancelled()); return { requested: true }; } } };
    import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => import('/src/types/index.ts').then(({ DEFAULT_ZPLC_CONFIG }) => {
      const file = { id: 'motor-st', name: 'Motor.st', path: 'src/Motor.st', language: 'ST', content: ${JSON.stringify(initialProgram)}, isModified: ${modified}, parentPath: 'src' };
      const auxiliary = { id: 'aux-st', name: 'Aux.st', path: 'src/Aux.st', language: 'ST', content: 'PROGRAM Aux\\nEND_PROGRAM', isModified: false, parentPath: 'src' };
      const visuals = ${JSON.stringify(reviewVisualSources)};
      const fbd = { id: 'blinky-fbd', name: 'main.fbd.json', path: 'src/main.fbd.json', language: 'FBD', content: visuals.fbd, isModified: false, parentPath: 'src' };
      const ld = { id: 'blinky-ld', name: 'main.ld.json', path: 'src/main.ld.json', language: 'LD', content: visuals.ld, isModified: false, parentPath: 'src' };
      const sfc = { id: 'blinky-sfc', name: 'main.sfc.json', path: 'src/main.sfc.json', language: 'SFC', content: visuals.sfc, isModified: false, parentPath: 'src' };
      const config = { ...DEFAULT_ZPLC_CONFIG, schemaVersion: 2, name: 'Studio smoke', version: '2.0.0', target: { board: 'rpi_pico' }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] };
      useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectName: 'Studio smoke', projectConfig: config, projectSession: 7, projectConfigDirty: false, directoryHandle: null, fileTree: { id: 'root', name: 'Studio smoke', type: 'directory', path: '', isExpanded: true, children: [{ id: 'src', name: 'src', type: 'directory', path: 'src', isExpanded: true, children: [{ id: 'motor-st', name: 'Motor.st', type: 'file', path: 'src/Motor.st', language: 'ST' }, { id: 'aux-st', name: 'Aux.st', type: 'file', path: 'src/Aux.st', language: 'ST' }] }] }, loadedFiles: new Map([['motor-st', file], ['aux-st', auxiliary], ['blinky-fbd', fbd], ['blinky-ld', ld], ['blinky-sfc', sfc]]), activeFileId: 'motor-st', openTabs: ['motor-st'], activeConsoleTab: 'problems', isConsoleCollapsed: false, consoleHeight: 320, compilerMessages: [], compilerMessagesChecked: false, compilerRunId: 11, workspaceScenarioLink: null });
      window.__zplcSmoke.getState = () => { const state = useIDEStore.getState(); return { activeFileId: state.activeFileId, openTabs: state.openTabs }; };
      window.__zplcSmoke.getBuildState = () => ({ evidence: useIDEStore.getState().canonicalWorkspaceBuildEvidence });
      window.__zplcSmoke.getFileContent = (fileId) => useIDEStore.getState().loadedFiles.get(fileId)?.content;
      window.__zplcSmoke.ready = true;
    }));
  })()`;
}

async function main(): Promise<void> {
  const goldenRoot = join(import.meta.dir, '..', 'projects', 'motor_start_stop');
  const motorPlantRoot = join(import.meta.dir, '..', 'projects', 'motor_plant');
  const conveyorRoot = join(import.meta.dir, '..', 'projects', 'conveyor_01');
  const pedestrianRoot = join(import.meta.dir, '..', 'projects', 'pedestrian_crossing');
  const tankRoot = join(import.meta.dir, '..', 'projects', 'tank_level');
  const [golden, compiledGolden, motorPlant, conveyor, pedestrian, tank] = await Promise.all([testsRun(goldenRoot), compilerCompile(goldenRoot), testsRun(motorPlantRoot), testsRun(conveyorRoot), testsRun(pedestrianRoot), testsRun(tankRoot)]);
  if (!golden.ok) throw new Error(`Golden native POSIX test failed: ${golden.evidence.diagnostics.slice(0, 3).map((diagnostic) => diagnostic.code).join(', ') || 'unknown diagnostic'}`);
  if (!motorPlant.ok) throw new Error(`Motor plant native POSIX test failed: ${motorPlant.evidence.diagnostics.slice(0, 3).map((diagnostic) => diagnostic.code).join(', ') || 'unknown diagnostic'}`);
  if (!conveyor.ok) throw new Error(`Conveyor native POSIX test failed: ${conveyor.evidence.diagnostics.slice(0, 3).map((diagnostic) => diagnostic.code).join(', ') || 'unknown diagnostic'}`);
  if (!pedestrian.ok) throw new Error(`Pedestrian crossing native POSIX test failed: ${pedestrian.evidence.diagnostics.slice(0, 3).map((diagnostic) => diagnostic.code).join(', ') || 'unknown diagnostic'}`);
  if (!tank.ok) throw new Error(`Tank level native POSIX test failed: ${tank.evidence.diagnostics.slice(0, 3).map((diagnostic) => diagnostic.code).join(', ') || 'unknown diagnostic'}`);
  const compileEnvelope = canonicalCompileEnvelope(compiledGolden);
  const testedProgram = golden.evidence.artifacts.find((artifact) => artifact.kind === 'zplc');
  const compiledProgram = compiledGolden.ok ? compiledGolden.evidence.artifacts.find((artifact) => artifact.kind === 'zplc') : undefined;
  if (!testedProgram || !compiledProgram || testedProgram.sha256 !== compiledProgram.sha256 || testedProgram.byteLength !== compiledProgram.byteLength) {
    throw new Error('Golden canonical compile does not match the .zplc artifact used by native POSIX scenarios');
  }
  const validProgram = readFileSync(join(goldenRoot, 'src', 'Motor.st'), 'utf8');
  const tempRoot = mkdtempSync(join(tmpdir(), 'zplc-studio-smoke-'));
  let vite: OwnedProcess | undefined;
  let browser: OwnedProcess | undefined;
  let cdp: Cdp | undefined;
  try {
    const vitePort = await freePort();
    vite = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(vitePort), '--strictPort'], { cwd: import.meta.dir + '/..', stdout: 'ignore', stderr: 'ignore' });
    await waitFor('Vite', async () => (await fetch(`http://${HOST}:${vitePort}/`).catch(() => null))?.ok ? true : undefined);
    const profile = join(tempRoot, 'profile');
    browser = Bun.spawn([chromium(), '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
    const debugPort = await waitFor('Chromium DevTools port', () => {
      const activePort = join(profile, 'DevToolsActivePort');
      if (!existsSync(activePort)) return undefined;
      const port = Number(readFileSync(activePort, 'utf8').split(/\r?\n/, 1)[0]);
      return Number.isInteger(port) && port > 0 ? port : undefined;
    });
    const target = await waitFor('Chromium DevTools', async () => {
      const targets = await fetch(`http://${HOST}:${debugPort}/json/list`).then((response) => response.json()).catch(() => [] as Array<{ type?: string; webSocketDebuggerUrl?: string }>);
      return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    });
    cdp = await Cdp.connect(target);
    await cdp.command('Runtime.enable'); await cdp.command('Log.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await cdp.command('Page.enable');
    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    assert(await cdp.evaluate('window.innerWidth === 1366 && window.innerHeight === 768') === true, 'Viewport is not 1366x768');
    const reviewDir = process.env.ZPLC_STUDIO_REVIEW_DIR?.trim();
    if (reviewDir) await captureWelcomeReviewScreens(cdp, reviewDir);
    await cdp.evaluate(pageSeed(golden, compileEnvelope));
    await waitFor('renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await waitFor('Studio toolbar', async () => await cdp!.evaluate("document.querySelectorAll('button').length > 0 ? true : undefined") === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const bar = document.querySelector('[aria-label="Operational status"]'); const live = bar?.querySelectorAll('[role="status"][aria-live="polite"][aria-atomic="true"]') ?? []; return Boolean(bar) && bar?.textContent?.includes('SIMULATION') && bar?.textContent?.includes('No runtime session') && bar.getBoundingClientRect().width <= 1366 && !bar?.hasAttribute('aria-live') && live.length === 1 && !live[0]?.textContent?.includes('cycles') && !live[0]?.textContent?.includes('overruns'); })()`) === true, 'Operational status must isolate its polite live announcement at 1366x768');
    if (reviewDir) {
      await captureReviewScreens(cdp, reviewDir);
      await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
      await waitFor('review reset document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
      await cdp.evaluate(pageSeed(golden, compileEnvelope));
      await waitFor('review reset renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
      await waitFor('review reset Studio toolbar', async () => await cdp!.evaluate("document.querySelectorAll('button').length > 0 ? true : undefined") === true ? true : undefined);
      assert(await cdp.evaluate(`document.querySelector('[aria-label="Operational status"]')?.textContent?.includes('No runtime session')`) === true, 'Review capture reset did not restore the disconnected smoke workbench');
      await captureLearnReviewScreens(cdp, reviewDir);
    }
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); useIDEStore.setState({ debug: { ...state.debug, forcedValues: new Map([['Motor.Forward', { path: 'Motor.Forward', address: 0, type: 'BOOL', bytesHex: '01', state: 'forced' }]]) } }); window.__zplcSmoke.forced = true; })`);
    await waitFor('unconfirmed force count status', async () => await cdp!.evaluate(`window.__zplcSmoke.forced && document.querySelector('[aria-label="Operational status"] [role="alert"]')?.textContent?.includes('verify and reconnect before operating') ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); useIDEStore.setState({ debug: { ...state.debug, forcesUnconfirmed: true } }); window.__zplcSmoke.forcesUnconfirmed = true; })`);
    await waitFor('unconfirmed force alert', async () => await cdp!.evaluate(`window.__zplcSmoke.forcesUnconfirmed && document.querySelector('[aria-label="Operational status"] [role="alert"]')?.textContent?.includes('verify and reconnect before operating') ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const text = document.querySelector('[aria-label="Operational status"]')?.textContent ?? ''; return !text.includes('HIL') && !text.includes('token') && !text.includes('secret'); })()`) === true, 'Operational status must not claim qualification or expose secret-like data');
    const press = async (key: string, modifiers = 0) => {
      const code = key === ' ' ? 'Space' : key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key;
      await cdp!.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
      await cdp!.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    };
    const clickNode = async (selector: string) => {
      const point = await cdp!.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); const rect = node?.getBoundingClientRect(); return rect && rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined; })()`);
      assert(typeof point === 'object' && point !== null && 'x' in point && 'y' in point, `Visual node is unavailable: ${selector}`);
      await cdp!.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await cdp!.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await cdp!.evaluate(`document.querySelector(${JSON.stringify(selector)})?.closest('.flex-1')?.focus()`);
    };
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); window.__zplcSmoke.visualState = { activeFileId: state.activeFileId, openTabs: [...state.openTabs], files: ['blinky-fbd', 'blinky-ld', 'blinky-sfc'].map((id) => { const file = state.loadedFiles.get(id); return file && { id, content: file.content, isModified: file.isModified }; }) }; })`);
    const visualState = await waitFor('visual smoke state', async () => {
      const value = await cdp!.evaluate('window.__zplcSmoke?.visualState');
      return value && typeof value === 'object' ? value as { activeFileId: string; openTabs: string[]; files: Array<{ id: string; content: string; isModified: boolean } | undefined> } : undefined;
    });
    assert(visualState.files.every(Boolean), 'Visual smoke sources are unavailable');
    try {
      for (const [kind, fileId, nodeId] of [['FBD', 'blinky-fbd', 'not_enable'], ['SFC', 'blinky-sfc', 'step_led_on']] as const) {
        const original = visualState.files.find((file) => file?.id === fileId)?.content;
        assert(typeof original === 'string', `${kind} smoke source is unavailable`);
      await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setActiveFile(${JSON.stringify(fileId)}))`);
      await waitFor(`${kind} copy editor`, async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === ${JSON.stringify(fileId)} && document.querySelector('.zplc-visual-editor .react-flow__node[data-id="${nodeId}"]') ? true : undefined`) === true ? true : undefined);
      const selector = `.zplc-visual-editor .react-flow__node[data-id="${nodeId}"]`;
      await clickNode(selector);
      await waitFor(`${kind} selected node`, async () => await cdp!.evaluate(`document.querySelector(${JSON.stringify(selector)})?.classList.contains('selected') ? true : undefined`) === true ? true : undefined);
      await press('c', 2); await press('v', 2);
      const changed = await waitFor(`${kind} pasted content`, async () => {
        const content = await cdp!.evaluate(`window.__zplcSmoke.getFileContent?.(${JSON.stringify(fileId)})`);
        return typeof content === 'string' && content !== original ? content : undefined;
      });
      const valid = await cdp.evaluate(`(() => { const model = JSON.parse(${JSON.stringify(changed)}); const ids = model.blocks ? model.blocks.map((block) => block.id) : [...model.steps, ...model.transitions].map((item) => item.id); const unique = new Set(ids.map((id) => id.toLowerCase())).size === ids.length; return ${JSON.stringify(kind)} === 'FBD'
        ? model.blocks.length === 6 && model.connections.length === 4 && unique
        : model.steps.length === 3 && model.transitions.length === 2 && model.actions?.length > 0 && model.steps.filter((step) => step.isInitial).length === 1 && new Set(model.steps.map((step) => step.name.toLowerCase())).size === model.steps.length && unique; })()`);
      assert(valid === true, `${kind} paste did not preserve the canonical graph`);
      }
      const ldOriginal = visualState.files.find((file) => file?.id === 'blinky-ld')?.content;
      assert(typeof ldOriginal === 'string', 'LD smoke source is unavailable');
      await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setActiveFile('blinky-ld'))`);
      await waitFor('LD copy editor', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'blinky-ld' && document.querySelector('[data-ld-element-id="ton_blink"]') ? true : undefined`) === true ? true : undefined);
      assert(await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')}); return element?.getAttribute('role') === 'button' && element.getAttribute('aria-label') === 'Select function block TON BlinkTimer' && element.getAttribute('aria-pressed') === 'false' && element.tabIndex === 0; })()`) === true, 'LD elements must expose an unselected keyboard button with a factual label');
      await cdp.evaluate(`document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')})?.focus()`);
      await waitFor('LD element keyboard focus', async () => await cdp!.evaluate(`document.activeElement === document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')}) ? true : undefined`) === true ? true : undefined);
      const ldScroll = await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')}); return { window: window.scrollY, container: element?.parentElement?.parentElement?.parentElement?.scrollTop ?? 0 }; })()`);
      await press(' ');
      await waitFor('LD Space selected element', async () => await cdp!.evaluate(`document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')})?.getAttribute('aria-pressed') === 'true' ? true : undefined`) === true ? true : undefined);
      assert(await cdp.evaluate(`JSON.stringify((() => { const element = document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')}); return { window: window.scrollY, container: element?.parentElement?.parentElement?.parentElement?.scrollTop ?? 0 }; })()) === JSON.stringify(${JSON.stringify(ldScroll)})`) === true, 'Space selection must not scroll the LD viewport');
      await press('Enter');
      await waitFor('LD Enter selected element', async () => await cdp!.evaluate(`document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')})?.getAttribute('aria-pressed') === 'true' ? true : undefined`) === true ? true : undefined);
      await waitFor('LD preset time control', async () => await cdp!.evaluate(`document.querySelector('[aria-label="Preset Time (PT)"]') instanceof HTMLInputElement ? true : undefined`) === true ? true : undefined);
      assert(await cdp.evaluate(`document.querySelector('[aria-label="Preset Time (PT)"]')?.value === 'T#500ms'`) === true, 'LD timer PT must start from the selected element parameters');
      await cdp.evaluate(`(() => { const input = document.querySelector('[aria-label="Preset Time (PT)"]'); if (!(input instanceof HTMLInputElement)) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'T#2s'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      assert(await cdp.evaluate(`document.querySelector('[aria-label="Preset Time (PT)"]')?.value === 'T#2s'`) === true, 'LD timer PT input did not accept the updated value');
      await cdp.evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save'))?.click()`);
      await waitFor('saved LD preset time', async () => {
        const content = await cdp!.evaluate(`window.__zplcSmoke.getFileContent?.('blinky-ld')`);
        return typeof content === 'string' && JSON.parse(content).rungs.flatMap((rung) => rung.grid.flatMap((row) => row.map((cell) => cell.element))).find((element) => element?.id === 'ton_blink')?.parameters?.PT === 'T#2s' ? true : undefined;
      });
      await cdp.evaluate(`document.querySelector(${JSON.stringify('[data-ld-element-id="ton_blink"]')})?.focus()`);
      await press(' ');
      await waitFor('reopened LD preset time', async () => await cdp!.evaluate(`document.querySelector('[aria-label="Preset Time (PT)"]')?.value === 'T#2s' ? true : undefined`) === true ? true : undefined);
      await press('c', 2); await press('v', 2);
      const ldChanged = await waitFor('LD pasted content', async () => {
        const content = await cdp!.evaluate(`window.__zplcSmoke.getFileContent?.('blinky-ld')`);
        return typeof content === 'string' && content !== ldOriginal ? content : undefined;
      });
      assert(await cdp.evaluate(`(() => { const model = JSON.parse(${JSON.stringify(ldChanged)}); const ids = model.rungs.flatMap((rung) => rung.grid.flatMap((row) => row.flatMap((cell) => cell.element ? [cell.element.id] : []))); return model.rungs.length === 3 && model.variables.local.some((variable) => variable.name === 'BlinkTimer_copy') && new Set(ids.map((id) => id.toLowerCase())).size === ids.length && model.rungs.every((rung, index) => rung.number === index + 1); })()`) === true, 'LD paste did not preserve a canonical independent rung');
    } finally {
      await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); const files = new Map(state.loadedFiles); for (const saved of ${JSON.stringify(visualState.files.filter(Boolean))}) { const file = files.get(saved.id); if (file) files.set(saved.id, { ...file, content: saved.content, isModified: saved.isModified }); } useIDEStore.setState({ loadedFiles: files, activeFileId: ${JSON.stringify(visualState.activeFileId)}, openTabs: ${JSON.stringify(visualState.openTabs)} }); const restored = useIDEStore.getState(); window.__zplcSmoke.visualStateRestored = { activeFileId: restored.activeFileId, openTabs: [...restored.openTabs], files: ['blinky-fbd', 'blinky-ld', 'blinky-sfc'].map((id) => { const file = restored.loadedFiles.get(id); return file && { id, content: file.content, isModified: file.isModified }; }) }; })`);
      await waitFor('restored visual smoke state', async () => await cdp!.evaluate(`JSON.stringify(window.__zplcSmoke?.visualStateRestored) === JSON.stringify(${JSON.stringify(visualState)}) ? true : undefined`) === true ? true : undefined);
    }

    await cdp.evaluate(`document.querySelector('button[aria-label^="Explorer"]')?.click()`);
    await waitFor('Explorer lower ledger', async () => await cdp!.evaluate(`Boolean(document.querySelector('#console-panel-explorer [role="tree"]')) ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const tree = document.querySelector('[role="tree"]'); const items = [...document.querySelectorAll('[role="treeitem"]')]; const group = tree?.querySelector('[role="group"]'); return tree?.getAttribute('aria-label') === 'Project files' && items.length === 3 && items.filter((item) => item.tabIndex === 0).length === 1 && items.every((item) => !item.firstElementChild?.classList.contains('ring-2')) && group?.closest('[role="treeitem"]')?.getAttribute('data-tree-node-id') === 'src'; })()`) === true, 'Explorer must own its group beneath src with one roving tab stop and no persistent focus ring');
    await cdp.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.focus()`);
    await press('ArrowLeft');
    await waitFor('collapsed src treeitem', async () => await cdp!.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.getAttribute('aria-expanded') === 'false' ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`document.querySelectorAll('[data-tree-node-id="motor-st"], [data-tree-node-id="aux-st"]').length === 0`) === true, 'Collapsed descendants must not remain in the tree');
    await press('ArrowRight');
    await waitFor('expanded src treeitem', async () => await cdp!.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.getAttribute('aria-expanded') === 'true' ? true : undefined`) === true ? true : undefined);
    await press('Enter');
    await waitFor('Enter collapsed src treeitem', async () => await cdp!.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.getAttribute('aria-expanded') === 'false' ? true : undefined`) === true ? true : undefined);
    await press(' ');
    await waitFor('Space expanded src treeitem', async () => await cdp!.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.getAttribute('aria-expanded') === 'true' ? true : undefined`) === true ? true : undefined);
    await press('End');
    await waitFor('Aux tree focus', async () => await cdp!.evaluate(`document.activeElement?.getAttribute('data-tree-node-id') === 'aux-st' ? true : undefined`) === true ? true : undefined);
    await press('Enter');
    await waitFor('Aux file open', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' && window.__zplcSmoke.getState?.().openTabs.includes('aux-st') && document.querySelector('[data-tree-node-id="aux-st"]')?.getAttribute('aria-selected') === 'true' ? true : undefined`) === true ? true : undefined);
    await press('ArrowUp');
    await waitFor('Motor tree focus', async () => await cdp!.evaluate(`document.activeElement?.getAttribute('data-tree-node-id') === 'motor-st' ? true : undefined`) === true ? true : undefined);
    await press(' ');
    await waitFor('Motor file open', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-st' && window.__zplcSmoke.getState?.().openTabs.includes('motor-st') && document.querySelector('[data-tree-node-id="motor-st"]')?.getAttribute('aria-selected') === 'true' ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('[data-tree-node-id="src"] > div')?.click()`);
    await waitFor('mouse collapsed src focus', async () => await cdp!.evaluate(`(() => { const src = document.querySelector('[data-tree-node-id="src"]'); return src?.getAttribute('aria-expanded') === 'false' && document.activeElement === src && [...document.querySelectorAll('[role="treeitem"]')].filter((item) => item.tabIndex === 0).length === 1 ? true : undefined; })()`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('[data-tree-node-id="src"] > div')?.click()`);
    await waitFor('mouse expanded src treeitem', async () => await cdp!.evaluate(`document.querySelector('[data-tree-node-id="src"]')?.getAttribute('aria-expanded') === 'true' ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('button[aria-label="Inspector"]')?.click()`);
    await waitFor('Inspector lower ledger', async () => await cdp!.evaluate(`Boolean(document.querySelector('#console-panel-inspector [aria-label="Workbench inspector"]')) ? true : undefined`) === true ? true : undefined);

    assert(await cdp.evaluate(`(() => { const list = [...document.querySelectorAll('[role="tablist"]')].find((item) => item.getAttribute('aria-label') === 'Editor views'); const tabs = [...list?.querySelectorAll('[role="tab"]') ?? []]; const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true'); return tabs.length === 2 && selected.length === 1 && selected[0]?.id === 'editor-tab-motor-st' && tabs.filter((tab) => tab.tabIndex === 0).length === 1 && tabs.every((tab) => tab.getAttribute('aria-controls') === 'editor-panel') && document.getElementById('editor-panel')?.getAttribute('aria-labelledby') === 'editor-tab-motor-st' && [...list?.children ?? []].every((item) => item.getAttribute('role') === 'presentation'); })()`) === true, 'Editor tabs must expose one selected roving tab with a shared labelled panel');
    await cdp.evaluate(`document.getElementById('editor-tab-motor-st')?.focus()`);
    await press('ArrowRight');
    await waitFor('ArrowRight editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' && document.activeElement?.id === 'editor-tab-aux-st' ? true : undefined`) === true ? true : undefined);
    await press('ArrowLeft');
    await waitFor('ArrowLeft editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-st' && document.activeElement?.id === 'editor-tab-motor-st' ? true : undefined`) === true ? true : undefined);
    await press('ArrowRight');
    await waitFor('second ArrowRight editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' && document.activeElement?.id === 'editor-tab-aux-st' ? true : undefined`) === true ? true : undefined);
    await press('ArrowRight');
    await waitFor('wrapped editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-st' && document.activeElement?.id === 'editor-tab-motor-st' ? true : undefined`) === true ? true : undefined);
    await press('End');
    await waitFor('End editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' && document.activeElement?.id === 'editor-tab-aux-st' ? true : undefined`) === true ? true : undefined);
    await press('Home');
    await waitFor('Home editor tab', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-st' && document.activeElement?.id === 'editor-tab-motor-st' ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const close = document.querySelector('button[aria-label="Close Motor.st"]'); close?.focus(); return document.activeElement === close; })()`) === true, 'Editor close button must be separately focusable');
    const text = async () => String(await cdp!.evaluate('document.body.innerText'));
    const click = async (label: string) => {
      const clicked = await cdp!.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)} || [...item.querySelectorAll('span')].some((span) => span.textContent?.trim() === ${JSON.stringify(label)})); if (!button || button.disabled) return false; button.click(); return true; })()`);
      if (clicked !== true) throw new Error(`Could not click enabled ${label}; visible controls: ${String(await cdp!.evaluate("[...document.querySelectorAll('button')].map((item) => item.textContent?.trim()).filter(Boolean).join(', ')"))}`);
    };
    const setFile = async (content: string, clean: boolean) => {
      await cdp!.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); state.updateFileContent('motor-st', ${JSON.stringify(content)}); if (${clean}) { const files = new Map(useIDEStore.getState().loadedFiles); files.set('motor-st', { ...files.get('motor-st'), isModified: false }); useIDEStore.setState({ loadedFiles: files }); } const updated = useIDEStore.getState(); window.__zplcSmoke.fileState = { content: updated.loadedFiles.get('motor-st')?.content, modified: updated.loadedFiles.get('motor-st')?.isModified, compilerRunId: updated.compilerRunId }; requestAnimationFrame(() => requestAnimationFrame(() => window.__zplcSmoke.changed = true)); })`);
      await waitFor('file update', async () => await cdp!.evaluate('window.__zplcSmoke.changed ? true : undefined') === true ? true : undefined);
      await cdp!.evaluate('window.__zplcSmoke.changed = false');
    };
    await click('Learn');
    await waitFor('Spanish Learn lesson', async () => (await text()).includes('Arranque y parada seguros') ? true : undefined);
    assert((await text()).includes('MotorStartStop') && (await text()).includes('20, 40, 90 y 140 ms') && !(await text()).includes('auto-graded'), 'Learn must begin in Spanish with the exact host-only guided path');
    await click('English');
    await waitFor('English Learn lesson', async () => (await text()).includes('Safe motor start-stop') ? true : undefined);
    assert((await text()).includes('This edit is not auto-graded.') && (await text()).includes('native POSIX host evidence only') && (await text()).includes('not hardware or HIL evidence.'), 'Learn must preserve honest host-only evidence wording');
    await click('Open Tests');
    await waitFor('Learn opens Tests', async () => await cdp!.evaluate(`Boolean(document.getElementById('console-panel-tests')) ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`window.__zplcSmoke.runRequests.length === 0`) === true, 'Learn must not run a scenario');
    await click('Problems');
    let diagnosticText = '';
    try {
      await waitFor('incremental compiler diagnostic', async () => { diagnosticText = await text(); return diagnosticText.includes('Live ST syntax') && diagnosticText.includes('Unexpected character') ? true : undefined; });
    } catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}; panel: ${diagnosticText}`); }
    assert((await text()).includes('src/Motor.st'), 'Compiler diagnostic did not retain src/Motor.st provenance');
    assert(await cdp.evaluate(`window.__zplcSmoke.compileCalls === 0 && !document.body.innerText.includes('Built saved workspace locally:')`) === true, 'An incremental ST diagnostic must not invoke or claim a canonical build');
    await cdp.evaluate("import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => window.__zplcSmoke.priorCompilerRunId = useIDEStore.getState().compilerRunId)");
    const priorCompilerRunId = await waitFor('compiler revision', async () => {
      const value = await cdp!.evaluate('Number.isInteger(window.__zplcSmoke?.priorCompilerRunId) ? window.__zplcSmoke.priorCompilerRunId : undefined');
      return typeof value === 'number' ? value : undefined;
    });
    await cdp.evaluate(`document.querySelector('button[aria-label="Close Motor.st"]')?.click()`);
    await waitFor('editor close focus recovery', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' && document.activeElement?.id === 'editor-tab-aux-st' ? true : undefined`) === true ? true : undefined);
    await setFile(validProgram, false);
    await waitFor('valid dirty source', async () => await cdp!.evaluate(`window.__zplcSmoke.fileState?.content === ${JSON.stringify(validProgram)} && window.__zplcSmoke.fileState?.modified === true && window.__zplcSmoke.fileState?.compilerRunId > ${priorCompilerRunId} ? true : undefined`) === true ? true : undefined);
    await click('Build'); await waitFor('Compile menu', async () => await cdp!.evaluate("[...document.querySelectorAll('button')].some((button) => [...button.querySelectorAll('span')].some((span) => span.textContent?.trim() === 'Compile')) ? true : undefined") === true ? true : undefined); await click('Compile');
    await waitFor('saved-workspace link fence', async () => (await text()).includes('Choose zplc.json') ? true : undefined);
    assert(await cdp.evaluate(`window.__zplcSmoke.compileCalls === 0 && window.__zplcSmoke.registerCalls === 0 && document.getElementById('console-panel-tests') && !document.body.innerText.includes('Built saved workspace locally:')`) === true, 'First Build without a saved-workspace link must select Tests without compiling or claiming success');
    assert(await cdp.evaluate(`(() => {
      const input = document.querySelector('input[data-workspace-manifest-input]');
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([123, 125])], 'zplc.json', { type: 'application/json' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`) === true, 'Tests tab does not expose an actionable saved-workspace manifest input');
    await waitFor('workspace link registration', async () => await cdp!.evaluate(`window.__zplcSmoke.registerCalls === 1`) === true ? true : undefined);
    assert(await cdp.evaluate(`window.__zplcSmoke.registerCalls === 1 && window.__zplcSmoke.compileCalls === 0 && !document.body.innerText.includes('opaque-workspace-capability')`) === true, 'Manifest selection must create an opaque link without compiling or exposing its token');
    await setFile(validProgram, true);
    await waitFor('saved workspace representation', async () => await cdp!.evaluate(`window.__zplcSmoke.fileState?.modified === false && document.body.innerText.includes('Linked saved workspace ready for host scenarios.') ? true : undefined`) === true ? true : undefined);
    await click('Build'); await waitFor('second Compile menu', async () => await cdp!.evaluate("[...document.querySelectorAll('button')].some((button) => [...button.querySelectorAll('span')].some((span) => span.textContent?.trim() === 'Compile')) ? true : undefined") === true ? true : undefined); await click('Compile');
    await waitFor('canonical saved workspace build', async () => await cdp!.evaluate(`window.__zplcSmoke.compileCalls === 1 && Boolean(window.__zplcSmoke.getBuildState?.().evidence) ? true : undefined`) === true ? true : undefined);
    await click('Output');
    await waitFor('canonical saved workspace build output', async () => (await text()).includes('Built saved workspace locally:') ? true : undefined);
    const canonicalBuild = await cdp.evaluate(`(() => { const build = window.__zplcSmoke.getBuildState?.(); return { calls: window.__zplcSmoke.compileCalls, sha: build?.evidence?.zplc?.sha256, bytes: build?.evidence?.zplc?.byteLength, fallback: document.body.innerText.includes('No diagnostics from the latest build') }; })()`);
    assert(JSON.stringify(canonicalBuild) === JSON.stringify({ calls: 1, sha: testedProgram.sha256, bytes: testedProgram.byteLength, fallback: false }), `Second Build must publish exactly one canonical artifact/evidence result without renderer fallback: ${JSON.stringify(canonicalBuild)}`);

    await click('Problems');
    await click('Check declared interlocks');
    await waitFor('covered declared interlock', async () => (await text()).includes('Covered') ? true : undefined);
    assert((await text()).includes('Checks exact NEVER coverage in saved scenarios. It does not establish physical safety, timing, or certification.'), 'Interlock coverage must keep its logical scope disclaimer');
    await cdp.evaluate('window.__zplcSmoke.safetyMode = \'malformed\'');
    await click('Check declared interlocks');
    await waitFor('fail-closed malformed declared interlock', async () => (await text()).includes('Declared interlock coverage result was invalid.') ? true : undefined);
    assert(!(await text()).includes('do-not-render'), 'Malformed declared interlock payload leaked into Problems');

    await click('Tests');
    await click('Run host scenarios');
    await waitFor('passed host scenarios', async () => (await text()).includes('Host POSIX scenarios passed.') ? true : undefined);
    assert((await text()).includes('Canonical saved build linked · native POSIX run · .zplc match · trace recorded.'), 'Host scenarios must link to the exact canonical saved .zplc artifact');
    assert(await cdp.evaluate(`(() => { const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence')); return Boolean(details) && !details.open; })()`) === true, 'Passed preview must start collapsed');
    assert(await cdp.evaluate(`(() => { const strip = document.querySelector('[data-recorded-motor-output]'); return Boolean(strip) && !strip.checkVisibility(); })()`) === true, 'Recorded motor output must remain hidden while passed evidence is collapsed');
    assert(await cdp.evaluate(`(() => { const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence')); details?.querySelector('summary')?.click(); const strip = details?.querySelector('[data-recorded-motor-output]'); const text = strip?.textContent ?? ''; const labels = [...strip?.querySelectorAll('[aria-label]') ?? []].map((item) => item.getAttribute('aria-label')); return Boolean(details?.open) && [...details.querySelectorAll('caption')].length >= 2 && [...details.querySelectorAll('th')].every((item) => item.getAttribute('scope') === 'col') && strip?.getClientRects().length !== 0 && text.includes('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.') && text.includes('Motor.Forward') && text.includes('Motor.Reverse') && text.includes('ON') && text.includes('OFF') && labels.includes('Motor.Forward ON at 20 ms') && labels.includes('Motor.Forward OFF at 0 ms') && labels.includes('Motor.Reverse OFF at 20 ms'); })()`) === true, 'Preview must open with accessible tables and an exact recorded motor state association');
    await click('Trace');
    assert(!(await text()).includes('Scenario evidence (recorded test result)') && await cdp.evaluate("!document.querySelector('[data-recorded-motor-output]')") === true, 'Recorded scenario preview leaked into live Trace');
    assert(await cdp.evaluate("!document.querySelector('[aria-label=\"Live native POSIX motor outputs\"]')") === true, 'Live motor output must remain hidden without a connected native session');

    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('motor plant document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    await cdp.evaluate(pageSeed(motorPlant, compileEnvelope, validProgram, false));
    await waitFor('motor plant renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await click('Tests');
    assert(await cdp.evaluate(`(() => {
      const input = document.querySelector('input[data-workspace-manifest-input]');
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([123, 125])], 'zplc.json', { type: 'application/json' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`) === true, 'Motor plant Tests tab does not expose an actionable saved-workspace manifest input');
    await waitFor('motor plant workspace link registration', async () => await cdp!.evaluate(`window.__zplcSmoke.registerCalls === 1`) === true ? true : undefined);
    await click('Run host scenarios');
    await waitFor('recorded motor plant', async () => await cdp!.evaluate(`document.querySelector('[data-recorded-motor-plant]')?.checkVisibility() ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => {
      const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence'));
      const plants = [...document.querySelectorAll('[data-recorded-motor-plant]')];
      const region = plants[0]?.querySelector('[aria-label="Recorded motor plant matrix"]');
      const associations = [...region?.querySelectorAll('[aria-label]') ?? []].map((item) => item.getAttribute('aria-label'));
      const copy = plants[0]?.textContent ?? '';
      return Boolean(details?.open)
        && plants.length === 1 && plants[0].checkVisibility()
        && region?.getAttribute('role') === 'region' && region?.getAttribute('tabindex') === '0'
        && ['Command', 'Running', 'At speed', 'Speed'].every((label) => copy.includes(label))
        && associations.includes('Command ON at 10 ms')
        && associations.includes('Running ON at 30 ms')
        && associations.includes('At speed YES at 30 ms')
        && associations.includes('Speed 100% at 30 ms')
        && copy.includes('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    })()`) === true, 'Motor plant result must auto-open one accessible recorded matrix with golden sample associations and honest host-only copy');
    await click('Run this scenario again');
    await waitFor('single scenario rerun', async () => (await text()).includes('Host POSIX scenario passed.') ? true : undefined);
    assert(await cdp.evaluate(`(() => {
      const requests = window.__zplcSmoke.runRequests;
      const exact = JSON.stringify(requests) === JSON.stringify([
        { workspaceId: 'opaque-workspace-capability' },
        { workspaceId: 'opaque-workspace-capability', scenarioId: 'MotorPlant' },
      ]);
      return exact && !document.body.innerText.includes('Host POSIX scenarios passed.') && Boolean(document.querySelector('[data-recorded-motor-plant]'));
    })()`) === true, 'Scenario rerun must replace Tests evidence through an exact opaque workspace and scenario request');
    if (reviewDir) await captureRecordedPlantReviewScreens(cdp, reviewDir, 'motor', 'Recorded motor plant matrix');
    await click('Trace');
    assert(await cdp.evaluate(`!document.querySelector('[data-recorded-motor-plant]')`) === true, 'Recorded motor plant must not leak into live Trace');

    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('conveyor document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    await cdp.evaluate(pageSeed(conveyor, compileEnvelope, validProgram, false));
    await waitFor('conveyor renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await click('Tests');
    assert(await cdp.evaluate(`(() => {
      const input = document.querySelector('input[data-workspace-manifest-input]');
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([123, 125])], 'zplc.json', { type: 'application/json' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`) === true, 'Conveyor Tests tab does not expose an actionable saved-workspace manifest input');
    await waitFor('conveyor workspace link registration', async () => await cdp!.evaluate(`window.__zplcSmoke.registerCalls === 1`) === true ? true : undefined);
    await click('Run host scenarios');
    await waitFor('recorded conveyor plant', async () => await cdp!.evaluate(`document.querySelector('[data-recorded-conveyor-plant]')?.checkVisibility() ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => {
      const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence'));
      const plants = [...document.querySelectorAll('[data-recorded-conveyor-plant]')];
      const region = plants[0]?.querySelector('[aria-label="Recorded conveyor plant matrix"]');
      const associations = [...region?.querySelectorAll('[aria-label]') ?? []].map((item) => item.getAttribute('aria-label'));
      const copy = plants[0]?.textContent ?? '';
      return Boolean(details?.open)
        && plants.length === 1 && plants[0].checkVisibility()
        && region?.getAttribute('role') === 'region' && region?.getAttribute('tabindex') === '0'
        && ['Belt command', 'Diverter command', 'Fault lamp', 'Classifier sensor', 'Metal sensor', 'Diverter sensor', 'Jam sensor', 'Classified count'].every((label) => copy.includes(label))
        && associations.includes('Belt command ON at 10 ms')
        && associations.includes('Jam sensor JAM at 50 ms')
        && associations.includes('Fault lamp ON at 50 ms')
        && copy.includes('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    })()`) === true, 'Conveyor result must auto-open one accessible recorded matrix with golden sample associations and honest host-only copy');
    await cdp.evaluate(`document.querySelector('button[aria-label="Run Conveyor01 again on native POSIX"]')?.click()`);
    await waitFor('single conveyor scenario rerun', async () => (await text()).includes('Host POSIX scenario passed.') ? true : undefined);
    assert(await cdp.evaluate(`JSON.stringify(window.__zplcSmoke.runRequests) === JSON.stringify([{ workspaceId: 'opaque-workspace-capability' }, { workspaceId: 'opaque-workspace-capability', scenarioId: 'Conveyor01' }])`) === true, 'Conveyor rerun must use only the exact scenario aria-label and opaque workspace request');
    if (reviewDir) await captureRecordedPlantReviewScreens(cdp, reviewDir, 'conveyor', 'Recorded conveyor plant matrix');
    await click('Trace');
    assert(await cdp.evaluate(`!document.querySelector('[data-recorded-conveyor-plant]')`) === true, 'Recorded conveyor plant must not leak into live Trace');

    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('pedestrian crossing document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    await cdp.evaluate(pageSeed(pedestrian, compileEnvelope, validProgram, false));
    await waitFor('pedestrian crossing renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await click('Tests');
    assert(await cdp.evaluate(`(() => {
      const input = document.querySelector('input[data-workspace-manifest-input]');
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([123, 125])], 'zplc.json', { type: 'application/json' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`) === true, 'Pedestrian crossing Tests tab does not expose an actionable saved-workspace manifest input');
    await waitFor('pedestrian crossing workspace link registration', async () => await cdp!.evaluate(`window.__zplcSmoke.registerCalls === 1`) === true ? true : undefined);
    await click('Run host scenarios');
    await waitFor('recorded pedestrian crossing', async () => await cdp!.evaluate(`document.querySelector('[data-recorded-pedestrian-crossing]')?.checkVisibility() ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => {
      const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence'));
      const crossings = [...document.querySelectorAll('[data-recorded-pedestrian-crossing]')];
      const region = crossings[0]?.querySelector('[aria-label="Recorded pedestrian crossing matrix"]');
      const associations = [...region?.querySelectorAll('[aria-label]') ?? []].map((item) => item.getAttribute('aria-label'));
      const copy = crossings[0]?.textContent ?? '';
      return Boolean(details?.open)
        && crossings.length === 1 && crossings[0].checkVisibility()
        && region?.getAttribute('role') === 'region' && region?.getAttribute('tabindex') === '0'
        && copy.includes('Pedestrian crossing · recorded host scenario')
        && associations.includes('Vehicle GREEN at 0 ms')
        && associations.includes('Pedestrian WALK at 60 ms')
        && associations.includes('Request ACTIVE at 60 ms')
        && associations.includes('Plant CROSSING at 60 ms')
        && associations.includes('Pedestrian STOP at 110 ms')
        && copy.includes('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    })()`) === true, 'Pedestrian crossing result must auto-open one accessible recorded matrix with golden states and honest host-only copy');
    await cdp.evaluate(`document.querySelector('button[aria-label="Run PedestrianCrossing again on native POSIX"]')?.click()`);
    await waitFor('single pedestrian crossing scenario rerun', async () => (await text()).includes('Host POSIX scenario passed.') ? true : undefined);
    assert(await cdp.evaluate(`JSON.stringify(window.__zplcSmoke.runRequests) === JSON.stringify([{ workspaceId: 'opaque-workspace-capability' }, { workspaceId: 'opaque-workspace-capability', scenarioId: 'PedestrianCrossing' }])`) === true, 'Pedestrian crossing rerun must use only the exact scenario aria-label and opaque workspace request');
    if (reviewDir) await captureRecordedPlantReviewScreens(cdp, reviewDir, 'pedestrian', 'Recorded pedestrian crossing matrix', '[data-recorded-pedestrian-crossing]');
    await click('Trace');
    assert(await cdp.evaluate(`!document.querySelector('[data-recorded-pedestrian-crossing]')`) === true, 'Recorded pedestrian crossing must not leak into live Trace');

    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('tank level document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    await cdp.evaluate(pageSeed(tank, compileEnvelope, validProgram, false));
    await waitFor('tank level renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await click('Tests');
    assert(await cdp.evaluate(`(() => {
      const input = document.querySelector('input[data-workspace-manifest-input]');
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([123, 125])], 'zplc.json', { type: 'application/json' }));
      Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`) === true, 'Tank level Tests tab does not expose an actionable saved-workspace manifest input');
    await waitFor('tank level workspace link registration', async () => await cdp!.evaluate(`window.__zplcSmoke.registerCalls === 1`) === true ? true : undefined);
    await click('Run host scenarios');
    await waitFor('recorded tank level', async () => await cdp!.evaluate(`document.querySelector('[data-recorded-tank-level]')?.checkVisibility() ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => {
      const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence'));
      const tanks = [...document.querySelectorAll('[data-recorded-tank-level]')];
      const region = tanks[0]?.querySelector('[aria-label="Recorded tank level matrix"]');
      const associations = [...region?.querySelectorAll('[aria-label]') ?? []].map((item) => item.getAttribute('aria-label'));
      const copy = tanks[0]?.textContent ?? '';
      return Boolean(details?.open)
        && tanks.length === 1 && tanks[0].checkVisibility()
        && region?.getAttribute('role') === 'region' && region?.getAttribute('tabindex') === '0'
        && copy.includes('Tank level controller · recorded host scenario')
        && associations.includes('Pump RUNNING at 10 ms')
        && associations.includes('Pump STOPPED at 70 ms')
        && associations.includes('Alarm ALARM at 80 ms')
        && copy.includes('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    })()`) === true, 'Tank level result must auto-open one accessible recorded matrix with golden states and honest host-only copy');
    await cdp.evaluate(`document.querySelector('button[aria-label="Run TankLevel again on native POSIX"]')?.click()`);
    await waitFor('single tank level scenario rerun', async () => (await text()).includes('Host POSIX scenario passed.') ? true : undefined);
    assert(await cdp.evaluate(`JSON.stringify(window.__zplcSmoke.runRequests) === JSON.stringify([{ workspaceId: 'opaque-workspace-capability' }, { workspaceId: 'opaque-workspace-capability', scenarioId: 'TankLevel' }])`) === true, 'Tank level rerun must use only the exact scenario aria-label and opaque workspace request');
    if (reviewDir) await captureRecordedPlantReviewScreens(cdp, reviewDir, 'tank', 'Recorded tank level matrix', '[data-recorded-tank-level]');
    await click('Trace');
    assert(await cdp.evaluate(`!document.querySelector('[data-recorded-tank-level]')`) === true, 'Recorded tank level must not leak into live Trace');

    // Restore the existing smoke fixture so subsequent editor-history checks retain their focused tab setup.
    await cdp.command('Page.navigate', { url: `http://${HOST}:${vitePort}/` });
    await waitFor('post motor plant document load', async () => await cdp!.evaluate("document.readyState === 'complete' ? true : undefined") === true ? true : undefined);
    await cdp.evaluate(pageSeed(golden, compileEnvelope));
    await waitFor('post motor plant renderer seed', async () => await cdp!.evaluate('window.__zplcSmoke?.ready ? true : undefined') === true ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.setState({ activeFileId: 'aux-st', openTabs: ['aux-st'], workspaceScenarioLink: { workspaceId: 'opaque-workspace-capability', projectSession: 7 } }))`);

    await setFile(invalidProgram, false); await click('Tests');
    await waitFor('unsaved test fence', async () => (await text()).includes('do not include changes that are not saved') ? true : undefined);
    assert(await cdp.evaluate(`(() => { const run = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Run host scenarios')); return Boolean(run?.disabled) && !document.body.innerText.includes('Host POSIX scenarios passed.'); })()`) === true, 'Edit must hide evidence and disable tests');
    await setFile(validProgram, true);
    await waitFor('selected workspace after save', async () => (await text()).includes('Linked saved workspace ready for host scenarios.') ? true : undefined);
    assert(!(await text()).includes('Host POSIX scenarios passed.'), 'Saving must not revive stale evidence');

    await cdp.evaluate(`window.__zplcSmoke.mode = 'malformed'`); await click('Run host scenarios');
    await waitFor('base pass with redacted preview', async () => (await text()).includes('Host POSIX scenarios passed.') ? true : undefined);
    const malformedText = await text();
    assert(!malformedText.includes('Scenario evidence') && !malformedText.includes('do-not-render') && await cdp.evaluate("!document.querySelector('[data-recorded-motor-output]')") === true, 'Malformed preview or secret reached DOM');

    await cdp.evaluate(`window.__zplcSmoke.mode = 'failed'`); await click('Run host scenarios');
    await waitFor('failed scenario preview', async () => (await text()).includes('One or more scenario assertions failed.') ? true : undefined);
    assert(await cdp.evaluate(`(() => { const details = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Scenario evidence')); return Boolean(details?.open) && document.body.innerText.includes('Failed') && document.body.innerText.includes('10 ms'); })()`) === true, 'Failed preview must start open with failure time');
    const body = await text();
    assert(!body.includes('opaque-workspace-capability') && !body.includes('do-not-render'), 'Opaque token or secret reached DOM');

    const settingsOpened = await cdp.evaluate(`(() => { const button = document.querySelector('button[title="Project Settings"]'); if (!button) return false; button.click(); return true; })()`);
    assert(settingsOpened === true, 'Could not open Project Settings');
    await waitFor('Project Settings', async () => (await text()).includes('Project Settings') ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); window.__zplcSmoke.taskLimitOriginalConfig = state.projectConfig; window.__zplcSmoke.taskLimitSeeded = Boolean(state.projectConfig); if (state.projectConfig) useIDEStore.setState({ projectConfig: { ...state.projectConfig, tasks: Array.from({ length: 16 }, (_, index) => ({ name: 'Task' + (index + 1), trigger: 'cyclic', interval: 100, priority: 5, programs: [] })) } }); })`);
    await waitFor('task-limit smoke fixture', async () => await cdp.evaluate(`window.__zplcSmoke?.taskLimitSeeded && window.__zplcSmoke.taskLimitOriginalConfig ? true : undefined`) === true ? true : undefined);
    await waitFor('task limit UI', async () => (await text()).includes('Task limit reached: 16 of 16. Remove a task before adding another.') ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Add Task')); const originallyDisabled = button?.disabled === true && button?.getAttribute('type') === 'button' && Boolean(button?.getAttribute('aria-describedby')); const before = useIDEStore.getState().projectConfig?.tasks.length; if (button) { button.disabled = false; button.click(); } window.__zplcSmoke.taskLimitUi = Boolean(originallyDisabled && before === 16 && useIDEStore.getState().projectConfig?.tasks.length === 16); })`);
    await waitFor('task-limit functional guard', async () => await cdp.evaluate(`window.__zplcSmoke?.taskLimitUi === true ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { useIDEStore.setState({ projectConfig: window.__zplcSmoke.taskLimitOriginalConfig }); window.__zplcSmoke.taskLimitRestored = useIDEStore.getState().projectConfig === window.__zplcSmoke.taskLimitOriginalConfig; })`);
    await waitFor('restored task-limit smoke fixture', async () => await cdp.evaluate(`window.__zplcSmoke?.taskLimitRestored === true ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const list = [...document.querySelectorAll('[role="tablist"]')].find((item) => item.getAttribute('aria-label') === 'Editor views'); const tabs = [...list?.querySelectorAll('[role="tab"]') ?? []]; return tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length === 1 && document.getElementById('editor-tab-settings')?.getAttribute('aria-selected') === 'true' && document.getElementById('editor-tab-settings')?.tabIndex === 0 && document.getElementById('editor-panel')?.getAttribute('aria-labelledby') === 'editor-tab-settings'; })()`) === true, 'Settings must remain the selected editor tab');
    assert((await text()).includes('Firmware toolchain') && (await text()).includes('Not checked'), 'Toolchain card did not start in its honest idle state');
    assert(await cdp.evaluate(`(() => { const card = [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Firmware toolchain')); card?.querySelector('summary')?.click(); const button = [...card?.querySelectorAll('button') ?? []].find((item) => item.textContent?.includes('Choose checkout & check')); return Boolean(card?.open && button?.getAttribute('type') === 'button' && button?.getAttribute('aria-describedby')); })()`) === true, 'Toolchain card must expose an accessible human check action');
    await cdp.evaluate(`([...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Choose checkout & check')))?.focus()`); await click('Choose checkout & check');
    await waitFor('toolchain attention result', async () => (await text()).includes('Needs attention') ? true : undefined);
    await waitFor('toolchain action focus return', async () => await cdp!.evaluate(`document.activeElement?.textContent?.includes('Choose checkout & check') && window.__zplcSmoke.toolchainCalls === 1 ? true : undefined`) === true ? true : undefined);
    const toolchainText = String(await cdp.evaluate(`(() => [...document.querySelectorAll('details')].find((item) => item.textContent?.includes('Firmware toolchain'))?.innerText ?? '')()`));
    assert(toolchainText.includes('Checks only local firmware build prerequisites.') && !toolchainText.includes('Build runtime locally') && !toolchainText.includes('rpi_pico') && !toolchainText.includes('opaque-workspace-capability'), 'Toolchain attention state leaked a board detail, opaque token, or build action');
    await cdp.evaluate('window.__zplcSmoke.toolchainReady = true'); await click('Choose checkout & check');
    await waitFor('ready toolchain build action', async () => (await text()).includes('Build runtime locally') ? true : undefined);
    const readyToolchainText = await text();
    assert(readyToolchainText.includes('trusted checkout only') && readyToolchainText.includes('does not flash, deploy, connect a device, or qualify hardware') && !readyToolchainText.includes('do-not-render'), 'Ready toolchain build scope or trust copy is missing');
    await cdp.evaluate(`document.querySelector('button[aria-label="Build runtime locally"]')?.focus()`); await click('Build runtime locally');
    await waitFor('local firmware success', async () => (await text()).includes('Local cross-build completed') ? true : undefined);
    await waitFor('local firmware build focus return', async () => await cdp!.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Build runtime locally' ? true : undefined`) === true ? true : undefined);
    const buildEvidence = await cdp.evaluate(`(() => { const button = document.querySelector('button[aria-label="Build runtime locally"]'); const body = document.body.innerText; return { focus: document.activeElement === button, target: body.includes('Raspberry Pi Pico'), hash: body.includes('a'.repeat(64)), bytes: body.includes('52 bytes'), safe: !body.includes('do-not-render') && !body.includes('zephyrBoard') }; })()`) as Record<string, boolean>;
    assert(Object.values(buildEvidence).every(Boolean), `Safe local build evidence or focus recovery is missing: ${JSON.stringify(buildEvidence)}`);
    await cdp.evaluate(`window.__zplcSmoke.deferToolchain = true`); await click('Choose checkout & check');
    await waitFor('reinspection start', async () => (await text()).includes('Checking…') ? true : undefined);
    const reinspectionText = await text();
    assert(!reinspectionText.includes('Local cross-build completed') && !reinspectionText.includes('a'.repeat(64)) && !reinspectionText.includes('Build runtime locally'), 'A new inspection must clear prior local-build evidence and capability before it settles');
    await cdp.evaluate(`window.__zplcSmoke.deferToolchain = false; window.__zplcSmoke.resolveToolchain?.(window.__zplcSmoke.toolchainResult(false));`);
    await waitFor('reinspection attention', async () => (await text()).includes('Needs attention') ? true : undefined);
    await cdp.evaluate(`window.__zplcSmoke.toolchainReady = true`); await click('Choose checkout & check');
    await waitFor('reinspection ready', async () => (await text()).includes('Build runtime locally') ? true : undefined);
    assert(!(await text()).includes('Local cross-build completed') && !(await text()).includes('a'.repeat(64)), 'A ready reinspection must not revive evidence from a prior checkout');
    await cdp.evaluate(`window.__zplcSmoke.buildMode = 'active'; document.querySelector('button[aria-label="Build runtime locally"]')?.focus()`); await click('Build runtime locally');
    await waitFor('active build cancel action', async () => (await text()).includes('Cancel build') ? true : undefined);
    await cdp.evaluate(`([...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Cancel build')))?.focus()`); await click('Cancel build');
    await waitFor('cancelled local build', async () => (await text()).includes('Build cancelled after local cleanup.') ? true : undefined);
    await waitFor('cancelled local build focus return', async () => await cdp!.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Build runtime locally' ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`window.__zplcSmoke.cancelCalls === 1 && document.activeElement?.getAttribute('aria-label') === 'Build runtime locally'`) === true, 'Cancel must reach the bridge and return focus after the settled result');
    await cdp.evaluate(`window.__zplcSmoke.buildMode = 'malformed'; document.querySelector('button[aria-label="Build runtime locally"]')?.focus()`); await click('Build runtime locally');
    await waitFor('malformed local build failure', async () => (await text()).includes('Firmware build did not complete.') ? true : undefined);
    assert(!(await text()).includes('do-not-render'), 'Malformed firmware build result reached the DOM');
    await cdp.evaluate(`document.getElementById('editor-tab-settings')?.focus()`);
    await Bun.sleep(50);
    assert(await cdp.evaluate(`document.activeElement?.id === 'editor-tab-settings'`) === true, 'Terminal build focus recovery must not override a later Settings focus');
    await press('ArrowRight');
    await waitFor('settings keyboard file selection', async () => await cdp!.evaluate(`document.activeElement?.id === 'editor-tab-aux-st' && document.getElementById('editor-tab-aux-st')?.getAttribute('aria-selected') === 'true' && !document.getElementById('editor-tab-settings') ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('button[title="Project Settings"]')?.click()`);
    await waitFor('settings reopened', async () => await cdp!.evaluate(`document.getElementById('editor-tab-settings') ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('button[aria-label="Close Settings"]')?.click()`);
    await waitFor('settings close focus recovery', async () => await cdp!.evaluate(`document.activeElement?.id === 'editor-tab-aux-st' && document.getElementById('editor-tab-aux-st')?.getAttribute('aria-selected') === 'true' ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const tab = document.getElementById('editor-tab-aux-st'); const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }); tab?.dispatchEvent(event); return event.defaultPrevented && document.activeElement === tab && window.__zplcSmoke.getState?.().activeFileId === 'aux-st'; })()`) === true, 'Supported keys on a single editor tab must prevent browser scrolling');
    const emptyLd = JSON.stringify({ name: 'Undo smoke', variables: { local: [], outputs: [] }, rungs: [] }, null, 2);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); const files = new Map(state.loadedFiles); files.set('motor-ld', { id: 'motor-ld', name: 'Motor.ld.json', path: 'src/Motor.ld.json', language: 'LD', content: ${JSON.stringify(emptyLd)}, isModified: false, parentPath: 'src' }); useIDEStore.setState({ loadedFiles: files }); useIDEStore.getState().setActiveFile('motor-ld'); })`);
    await waitFor('LD visual editor', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-ld' && document.querySelector('[role="toolbar"][aria-label="Visual editor history"]') ? true : undefined`) === true ? true : undefined);
    const visualHistoryControls = await cdp.evaluate(`(() => { const toolbar = document.querySelector('[role="toolbar"][aria-label="Visual editor history"]'); const undo = toolbar?.querySelector('button[aria-label="Undo visual edit"]'); const redo = toolbar?.querySelector('button[aria-label="Redo visual edit"]'); return Boolean(toolbar) && !toolbar?.closest('[role="tablist"]') && undo?.getAttribute('title')?.includes('Ctrl+Z') && redo?.getAttribute('title')?.includes('Ctrl+Shift+Z') && undo?.tabIndex === 0 && redo?.tabIndex === 0 && undo?.disabled && redo?.disabled; })()`);
    assert(visualHistoryControls === true, 'Visual history toolbar must expose initially disabled, labelled controls');
    await click('Add Rung');
    const rungOne = await waitFor('first LD visual change', async () => {
      const content = await cdp!.evaluate(`window.__zplcSmoke.getFileContent?.('motor-ld')`);
      return typeof content === 'string' && content !== emptyLd ? content : undefined;
    });
    await click('Add Rung');
    const rungTwo = await waitFor('second LD visual change', async () => {
      const content = await cdp!.evaluate(`window.__zplcSmoke.getFileContent?.('motor-ld')`);
      return typeof content === 'string' && content !== rungOne ? content : undefined;
    });
    assert(await cdp.evaluate(`!document.querySelector('button[aria-label="Undo visual edit"]')?.disabled && document.querySelector('button[aria-label="Redo visual edit"]')?.disabled`) === true, 'Visual change must enable only undo');
    const burstUndo = await cdp.evaluate(`(() => { const wrapper = document.querySelector('[role="toolbar"][aria-label="Visual editor history"]')?.parentElement; const first = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); const second = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); wrapper?.dispatchEvent(first); wrapper?.dispatchEvent(second); return first.defaultPrevented && second.defaultPrevented && window.__zplcSmoke.getFileContent?.('motor-ld') === ${JSON.stringify(emptyLd)}; })()`);
    assert(burstUndo === true, 'Two Ctrl+Z events in one task must traverse C → B → A');
    const burstRedo = await cdp.evaluate(`(() => { const wrapper = document.querySelector('[role="toolbar"][aria-label="Visual editor history"]')?.parentElement; const first = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }); const second = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }); wrapper?.dispatchEvent(first); wrapper?.dispatchEvent(second); return first.defaultPrevented && second.defaultPrevented && window.__zplcSmoke.getFileContent?.('motor-ld') === ${JSON.stringify(rungTwo)}; })()`);
    assert(burstRedo === true, 'Two Ctrl+Shift+Z events in one task must traverse A → B → C');
    await cdp.evaluate(`document.querySelector('button[title="Project Settings"]')?.click()`);
    await waitFor('settings over LD', async () => await cdp!.evaluate(`document.getElementById('editor-tab-settings') ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); document.getElementById('editor-panel')?.dispatchEvent(event); return !event.defaultPrevented && window.__zplcSmoke.getFileContent?.('motor-ld') === ${JSON.stringify(rungTwo)}; })()`) === true, 'Settings must not receive visual undo shortcuts from an underlying LD tab');
    await cdp.evaluate(`document.querySelector('button[aria-label="Close Settings"]')?.click()`);
    await waitFor('LD after settings shortcut test', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'motor-ld' && !document.getElementById('editor-tab-settings') ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`(() => { const wrapper = document.querySelector('[role="toolbar"][aria-label="Visual editor history"]')?.parentElement; const input = document.createElement('textarea'); wrapper?.append(input); input.focus(); const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); input.dispatchEvent(event); input.remove(); return !event.defaultPrevented && window.__zplcSmoke.getFileContent?.('motor-ld') === ${JSON.stringify(rungTwo)}; })()`) === true, 'Visual shortcuts must leave editable controls inside the visual panel alone');
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setActiveFile('aux-st'))`);
    await waitFor('Aux ST after visual history smoke', async () => await cdp!.evaluate(`window.__zplcSmoke.getState?.().activeFileId === 'aux-st' ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => { const state = useIDEStore.getState(); useIDEStore.setState({ projectConfigDirty: true, debug: { ...state.debug, forcedValues: new Map(), forcesUnconfirmed: false } }); window.__zplcSmoke.closeDirty = useIDEStore.getState().hasUnsavedChanges(); })`);
    await waitFor('dirty project before close', async () => await cdp!.evaluate('window.__zplcSmoke.closeDirty ? true : undefined') === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('button[aria-label="Explorer"]')?.click()`);
    await waitFor('Explorer lower ledger before close project', async () => await cdp!.evaluate(`Boolean(document.querySelector('#console-panel-explorer [role="tree"]')) ? true : undefined`) === true ? true : undefined);
    assert(await cdp.evaluate(`Boolean(document.querySelector('button[aria-label="Close Project"]'))`) === true, 'Close Project control is unavailable');
    await cdp.evaluate(`document.querySelector('button[aria-label="Close Project"]')?.focus(); document.querySelector('button[aria-label="Close Project"]')?.click()`);
    await Bun.sleep(100);
    const closeDialog = await cdp.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); return { dialog: dialog?.textContent ?? null, project: document.querySelector('button[aria-label="Close Project"]') !== null }; })()`) as { dialog: string | null; project: boolean };
    assert(closeDialog.dialog?.includes('Discard unsaved changes?'), `Unsaved close confirmation did not open: ${JSON.stringify(closeDialog)}`);
    assert(await cdp.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); return dialog?.textContent?.includes('Changes to this project will be lost when it closes.') && [...dialog.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Continue editing') && [...dialog.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Discard changes and close'); })()`) === true, 'Unsaved close confirmation must explain the loss and offer explicit choices');
    assert(await cdp.evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); return Boolean(dialog?.contains(document.activeElement)) && document.activeElement?.getAttribute('aria-label') === 'Close'; })()`) === true, 'Modal must initially focus a safe control inside the dialog');
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 });
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 });
    assert(await cdp.evaluate(`document.activeElement?.textContent?.trim() === 'Discard changes and close'`) === true, 'Shift+Tab must wrap inside the dialog');
    await press('Tab');
    assert(await cdp.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Close'`) === true, 'Tab must wrap inside the dialog');
    await press('Tab');
    assert(await cdp.evaluate(`document.activeElement?.textContent?.trim() === 'Continue editing'`) === true, 'Tab must stay within the dialog controls');
    await press('Escape');
    await waitFor('unsaved close cancellation focus recovery', async () => await cdp!.evaluate(`!document.querySelector('[role="dialog"]') && document.activeElement?.getAttribute('aria-label') === 'Close Project' && window.__zplcSmoke.getState?.().activeFileId === 'aux-st' ? true : undefined`) === true ? true : undefined);
    await cdp.evaluate(`document.querySelector('button[aria-label="Close Project"]')?.click()`);
    await waitFor('unsaved close confirmation reopened', async () => await cdp!.evaluate(`document.querySelector('[role="dialog"]') ? true : undefined`) === true ? true : undefined);
    await click('Discard changes and close');
    await waitFor('explicit unsaved project discard', async () => await cdp!.evaluate(`!document.querySelector('[role="dialog"]') && !document.querySelector('button[aria-label="Close Project"]') ? true : undefined`) === true ? true : undefined);
    assert(cdp.errors.length === 0, `Browser errors: ${cdp.errors.join(' | ')}`);
    console.log('Studio renderer vertical smoke passed at 1366x768 (mock bridge backed by a real native POSIX Tool API result; not HIL).');
  } finally {
    cdp?.close();
    await stop(browser); await stop(vite);
    if (tempRoot.startsWith(join(tmpdir(), 'zplc-studio-smoke-')) && existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
