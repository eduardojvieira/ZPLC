/**
 * What the plant journeys and the plant bench share: a project holding a scene, a way to reach the plant document of a running
 * application, and a launcher for the packaged application with the flags a measurement needs (a window with the GPU, or software
 * GL). It reaches the application only through the DevTools protocol, as a person would through input: the scene of a project is
 * a file of the project (`scenes/<name>.scene.json`), which the plant document lists and opens by itself (SCN-006).
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlantSceneFile, ScenePart } from '../../src/plant/contracts';
import { assert, Cdp, drain, freePort, HOST, packageRoot, stop, type OwnedProcess } from '../run-desktop-smoke';
import { pause, scaleWait, waiting, waitFor } from '../journeyTiming';
import { button, css, type App } from '../journeyApp';

/** What a journey or the bench uses of an app; the development host's `App` and the launcher below both have it. */
export type DriveApp = Pick<
  App,
  'cdp' | 'eval' | 'until' | 'click' | 'press' | 'type' | 'visible' | 'clickable' | 'text' | 'errors' | 'log'
>;

export interface SceneProject {
  scene: string;
  map: string;
  program: string;
  /** Names of the scene's parts that are belts, for a check that the plant moved. */
  name: string;
}

const SCENES = join(packageRoot, 'plant-scenes');
export const SHIPPED = { largest: 'merge-lines', smallest: 'belt-to-sensor' } as const;

export function shippedSceneProject(id: string): SceneProject {
  const read = (file: string) => readFileSync(join(SCENES, id, file), 'utf8');
  return { scene: read('scene.json'), map: read('plant-map.json'), program: read('reference.st'), name: id };
}

/** The stress scene of PLT-014: 200 dynamic boxes on 20 conveyors, every belt running from the first scan. */
export const STRESS = { belts: 20, boxesPerBelt: 10 } as const;
const TOP = 0.45;
export function stressScene(): PlantSceneFile {
  const parts: ScenePart[] = [];
  for (let row = 0; row < STRESS.belts; row += 1) {
    const z = (row - 10) * 0.8;
    parts.push({ id: `belt${row}`, part: 'belt', name: `Belt${row}`, position: [0, TOP, z], rotationYDeg: 0, config: { length: 8 } });
    for (let k = 0; k < STRESS.boxesPerBelt; k += 1)
      parts.push({
        id: `box${row}-${k}`,
        part: 'box',
        name: `Box${row}_${k}`,
        position: [-3.8 + 0.6 * k, TOP, z],
        rotationYDeg: 0,
        config: {},
      });
  }
  return {
    schemaVersion: 1,
    name: 'Stress',
    parts,
    cameras: [
      { name: 'Overview', position: [0, 14, 12], target: [0, 0, 0] },
      { name: 'Side', position: [14, 3, 0], target: [0, 0, 0] },
      { name: 'Top', position: [0, 18, 0.1], target: [0, 0, 0] },
    ],
  };
}
export function stressSceneProject(): SceneProject {
  const signals: Record<string, unknown> = {};
  const declarations: string[] = [];
  const assignments: string[] = [];
  for (let row = 0; row < STRESS.belts; row += 1) {
    signals[`Belt${row}.run`] = { direction: 'command', type: 'BOOL', point: `Stress.B${row}` };
    declarations.push(`    B${row} AT %Q${Math.floor(row / 8)}.${row % 8} : BOOL;`);
    assignments.push(`B${row} := TRUE;`);
  }
  return {
    scene: `${JSON.stringify(stressScene(), null, 2)}\n`,
    map: `${JSON.stringify({ schemaVersion: 2, target: { scene: 'stress' }, signals }, null, 2)}\n`,
    program: `PROGRAM Stress\nVAR_OUTPUT\n${declarations.join('\n')}\nEND_VAR\n\n${assignments.join('\n')}\n\nEND_PROGRAM\n`,
    name: 'stress',
  };
}

/**
 * A folder Studio opens as a project: the blinky configuration, the scene's program as `src/main.st`, and the scene and its plant map in
 * `scenes/`.
 */
export function writeSceneProject(folder: string, project: SceneProject): string {
  mkdirSync(join(folder, 'src'), { recursive: true });
  const config = JSON.parse(readFileSync(join(packageRoot, 'projects', 'blinky_st', 'zplc.json'), 'utf8')) as Record<string, unknown>;
  config.name = `Plant ${project.name}`;
  writeFileSync(join(folder, 'zplc.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(folder, 'src', 'main.st'), project.program);
  mkdirSync(join(folder, 'scenes'), { recursive: true });
  writeFileSync(join(folder, 'scenes', `${project.name}.scene.json`), project.scene);
  writeFileSync(join(folder, 'scenes', `${project.name}.plant-map.json`), project.map);
  return folder;
}
export const copyExample = (folder: string, example: string): string => (
  cpSync(join(packageRoot, 'projects', example), folder, { recursive: true }),
  folder
);

/** The recent project is the way into a project of a packaged application (it has no folder dialog). */
export async function openRecentProject(app: DriveApp): Promise<void> {
  await app.click(css('[data-recent-project] > button'), 'the recent project');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined, 30_000);
}

/** The command palette, a few letters of a command's name, Enter: the way of a person with no pointer. */
export async function runFromPalette(app: DriveApp, command: string, filter: string): Promise<void> {
  const open = () => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
  await app.press('Ctrl+Shift+P');
  await app.until('the command palette to open', async () => (await open()) || undefined);
  await app.type(filter);
  await app.until(
    `the palette to list ${command}`,
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="${command}"]'))`)) || undefined,
  );
  await app.press('Enter');
  await app.until('the palette to close', async () => !(await open()) || undefined);
}

export async function openPlantDocument(app: DriveApp, project: SceneProject): Promise<void> {
  await runFromPalette(app, 'view.plant', 'show the plant');
  await app.until('the plant document', async () => (await app.visible(css('[data-plant-document]'))) || undefined, 30_000);
  // The document lists the project's scenes from its folder; choose this one as a person would from the scene chooser.
  const value = `file:${project.name}`;
  await app.until(
    'the project scene in the scene chooser',
    async () =>
      (await app.eval<boolean>(
        `Boolean([...document.querySelectorAll('[data-plant-panel] select option')].some((o) => o.value === ${JSON.stringify(value)}))`,
      )) || undefined,
    30_000,
  );
  await app.eval(
    `(() => { const select = [...document.querySelectorAll('[data-plant-panel] select')].find((s) => ` +
      `[...s.options].some((o) => o.value === ${JSON.stringify(value)})); select.focus(); ` +
      `Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); ` +
      `select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await app.until(
    'the scene to load',
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('[data-plant-panel] [data-plant-text]'))`)) || undefined,
    60_000,
  );
}

/**
 * One press of Run in simulation (spec 013 FLW-001): it builds, starts the simulator and runs. With a plant bound the command bar
 * still offers "Resume" (its Run and Pause follow the debug controller, which a lock-step session leaves paused), so the wait is
 * on the status rail, which says "Running".
 */
export async function runInSimulation(app: DriveApp): Promise<void> {
  await app.click(button('Run (F5)', 'prefix'), 'Run');
  await app.until(
    'the status rail to say Running',
    async () =>
      (await app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? ''`)).includes('Running') ||
      undefined,
    90_000,
  );
}

export const plantFacts = (app: DriveApp): Promise<string> =>
  app.eval<string>(`document.querySelector('[data-plant-text]')?.textContent ?? ''`);

/** A push button held for `ms`, by the pointer (a real press and release at its centre) or by the keyboard (Space down and up). */
export async function holdPushButton(app: DriveApp, name: string, how: 'pointer' | 'keyboard', ms = 400): Promise<void> {
  const target =
    `[...document.querySelectorAll('[data-plant-press]')].find((el) => el.getAttribute('data-plant-press') ` +
    `=== ${JSON.stringify(name)})`;
  if (how === 'keyboard') {
    await app.eval(`${target}.focus()`);
    const key = { key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32 };
    await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await pause(ms);
    await app.cdp.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    });
    return;
  }
  // the button may be below the fold of a document with the Inspector open: a pointer press lands only on what is on screen
  await app.eval(`${target}.scrollIntoView({ block: 'center' })`);
  const point = await app.eval<{ x: number; y: number }>(
    `(() => { const r = ${target}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  await app.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await app.cdp.command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await pause(ms);
  await app.cdp.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

/** Sets a field of the settings the renderer keeps, and starts the page again so the application reads it. */
export async function setSettingAndReload(app: DriveApp, field: string, value: unknown, theme?: string): Promise<void> {
  await app.eval(
    `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
      `stored.settings ?? stored; target[${JSON.stringify(field)}] = ${JSON.stringify(value)}; localStorage.setItem(key, ` +
      `JSON.stringify(stored)); ` +
      `${theme ? `localStorage.setItem('zplc-ide-theme', ${JSON.stringify(theme)});` : ''} })()`,
  );
  await app.cdp.command('Page.reload');
  await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
  await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await app.cdp.command('Page.bringToFront');
}

// ---------------------------------------------------------------------------------------------------------------------
// The packaged application with the flags of a measurement
// ---------------------------------------------------------------------------------------------------------------------

const KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  F5: { key: 'F5', code: 'F5', keyCode: 116 },
  P: { key: 'p', code: 'KeyP', keyCode: 80 },
};

export interface LaunchOptions {
  /** `['--headless', '--disable-gpu']` is the journeys' way; a measurement with a GPU gives a window size and no `--headless`. */
  flags: string[];
  /** Lays the page out at 1440 by 900 as the journeys do; leave off for a real window that keeps its real size. */
  deviceMetrics?: boolean;
}

/**
 * The packaged application on a private user-data directory. `recent` lists folders to put in its recent projects, the way a person
 * who chose them earlier would have. Native POSIX only, never HIL.
 */
export async function launchPackaged(
  executable: string,
  root: string,
  recent: string[],
  options: LaunchOptions,
): Promise<{ app: DriveApp; stop(): Promise<void> }> {
  const profile = join(root, 'profile');
  mkdirSync(profile, { recursive: true });
  writeFileSync(
    join(profile, 'zplc-recent-projects.v1.json'),
    JSON.stringify({
      schemaVersion: 1,
      projects: recent.map((path, index) => ({
        id: createHash('sha256').update(path, 'utf8').digest('hex'),
        path,
        lastOpenedAt: Date.now() - index,
      })),
    }),
  );
  const cdpPort = await freePort();
  const output: string[] = [];
  const env = { ...process.env };
  for (const name of ['ZPLC_NATIVE_SIM_BIN', 'ZPLC_SMOKE_FOLDER_ANSWER_FILE', 'ZPLC_PERSIST_ROOT', 'NODE_ENV']) delete env[name];
  const electron: OwnedProcess = Bun.spawn(
    [executable, ...options.flags, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    },
  );
  drain(electron, output, 'electron');
  let cdp: Cdp | undefined;
  const dispose = async () => {
    if (cdp) void cdp.command('Browser.close').catch(() => undefined);
    await Promise.race([electron.exited, pause(3_000)]);
    cdp?.close();
    await stop(electron);
  };
  try {
    const target = await waitFor('packaged file renderer target', async () => {
      const targets = await fetch(`http://${HOST}:${cdpPort}/json/list`)
        .then((response) => response.json())
        .catch(() => [] as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>);
      return targets.find(
        (item: { type?: string; url?: string; webSocketDebuggerUrl?: string }) =>
          item.type === 'page' && item.url?.startsWith('file:') && item.webSocketDebuggerUrl,
      )?.webSocketDebuggerUrl as string | undefined;
    });
    const page = await Cdp.connect(target);
    cdp = page;
    for (const method of ['Runtime.enable', 'Log.enable', 'Page.enable', 'Page.bringToFront']) await page.command(method);
    await page.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (options.deviceMetrics !== false && options.flags.includes('--headless'))
      await page.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const evaluate = <T>(expression: string) => page.evaluate(expression) as Promise<T>;
    const until: DriveApp['until'] = async (description, check, bound = 20_000) => {
      waiting.what = description;
      const timeoutMs = scaleWait(bound * 3);
      const started = Date.now();
      let last: unknown;
      while (Date.now() - started < timeoutMs) {
        try {
          const value = await check();
          if (value !== undefined && value !== false) return value;
        } catch (error) {
          last = error;
        }
        await Bun.sleep(100);
      }
      throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`);
    };
    await until(
      'real preload bridge and Welcome screen',
      async () =>
        (await evaluate<boolean>(`Boolean(window.electronAPI?.isElectron && document.querySelector('h1')?.textContent === 'ZPLC')`)) ||
        undefined,
    );
    page.errors.splice(0);
    const centre = (selector: string) =>
      `(() => { const el = ${selector}; if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null; ` +
      `el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); ` +
      `const box = el.getBoundingClientRect(); if (box.width === 0 || box.height === 0) return null; const x = box.x + box.width / 2; ` +
      `const y = box.y + box.height / 2; ` +
      `const hit = document.elementFromPoint(x, y); return hit && (el === hit || el.contains(hit)) ? { x, y } : null; })()`;
    const app: DriveApp = {
      cdp: page,
      log: () => `${output.join('')}\nrenderer errors: ${page.errors.join(' | ')}`,
      eval: evaluate,
      until,
      click: async (target, description = target.slice(0, 120)) => {
        const point = await until(
          `${description} to be clickable`,
          async () => (await evaluate<{ x: number; y: number } | null>(centre(target))) ?? undefined,
        );
        await page.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
        await page.command('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: 1,
          clickCount: 1,
        });
        await page.command('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: 0,
          clickCount: 1,
        });
      },
      press: async (chord) => {
        const parts = chord.split('+');
        const name = parts.pop()!;
        const definition = KEYS[name.length === 1 ? name.toUpperCase() : name];
        assert(definition, `Unknown key ${chord}`);
        const modifiers = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0);
        const text = definition.key === 'Enter' ? '\r' : undefined;
        await page.command('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: definition.key,
          code: definition.code,
          text,
          unmodifiedText: text,
          windowsVirtualKeyCode: definition.keyCode,
          modifiers,
        });
        await page.command('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: definition.key,
          code: definition.code,
          windowsVirtualKeyCode: definition.keyCode,
          modifiers,
        });
      },
      type: async (text) => void (await page.command('Input.insertText', { text })),
      clickable: async (target) => (await evaluate<unknown>(centre(target))) !== null,
      visible: async (target) =>
        await evaluate<boolean>(
          `(() => { const el = ${target}; if (!el) return false; const box = el.getBoundingClientRect(); return box.width > 0 && ` +
            `box.height > 0; })()`,
        ),
      text: () => evaluate<string>('document.body.innerText'),
      errors: page.errors,
    };
    return { app, stop: dispose };
  } catch (error) {
    await dispose();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-4_000)}`);
  }
}
