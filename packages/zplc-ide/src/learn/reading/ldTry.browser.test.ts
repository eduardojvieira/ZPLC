import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { browserApp, closeBrowserApp, type BrowserApp } from '../../test/browser';
import type { LdTryData } from '../readingTypes';

// LRN-041: the try-it lab on a real WebAssembly session, in headless Chromium (src/test/browser.ts).
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);

const SRC = 'reading/off-delay.ld.json';
const read = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');
const OFF_DELAY = read('off-delay.ld.json');
const OFF_DELAY_VAR = read('off-delay-var.ld.json');
const DATA: LdTryData = { src: SRC, inputs: [{ name: 'Button', kind: 'push' }], outputs: ['Light'], timing: ['Button', 'Light'] };
const HARNESS = `import('/src/learn/reading/tryHarness.tsx')`;
const LAMP = `document.querySelector('[data-lamp="Light"]')?.getAttribute('data-state')`;
const POWERED = (cell: string) => `document.querySelector('[data-ld-cell="${cell}"]')?.getAttribute('data-powered')`;
const STATUS = `document.querySelector('[data-lab-status]')?.getAttribute('data-lab-status')`;

async function mount(app: BrowserApp, data: LdTryData = DATA, program = OFF_DELAY): Promise<void> {
  await app.reload();
  await app.eval(
    `${HARNESS}.then((h) => { h.mountLab(${JSON.stringify(SRC)}, ${JSON.stringify(program)}, ${JSON.stringify(data)}); return true; })`,
  );
  await app.until('the lab ready', `${STATUS} === 'idle'`);
  // LRN-015: the lab does nothing on its own
  await Bun.sleep(400);
  if ((await app.eval(`document.querySelector('[data-lamp]')?.getAttribute('data-state')`)) !== 'unknown')
    throw new Error('the lab ran by itself');
}

/** The centre of the control `[data-lab-input=name]`, in page coordinates. */
const centreOf = (app: BrowserApp, selector: string) =>
  app.eval<{ x: number; y: number }>(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); ` +
      'return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()',
  );

async function press(app: BrowserApp, selector: string): Promise<void> {
  const { x, y } = await centreOf(app, selector);
  await app.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await app.cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
}
async function release(app: BrowserApp, selector: string): Promise<void> {
  const { x, y } = await centreOf(app, selector);
  await app.cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

describe('try-it lab on the WebAssembly runtime (LRN-041)', () => {
  test('feasibility gate: a TOF rung shows power flow and a lamp that is on with the input and off about PT after it falls', async () => {
    const app = await browserApp();
    await mount(app);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    await app.until('the lamp off and read', `${LAMP} === 'off'`);

    await press(app, '[data-lab-input="Button"]');
    await app.until('the lamp on with the input', `${LAMP} === 'on'`);
    await app.until('power at the contact and at the coil', `${POWERED('0,0')} === 'true' && ${POWERED('0,7')} === 'true'`);
    expect(await app.eval<string | null>(`document.querySelector('[data-lamp="Light"]').textContent`)).toContain('on');

    await release(app, '[data-lab-input="Button"]');
    const fell = await app.eval<number>(`performance.now()`);
    // PT is 300 ms: the coil is still energized shortly after the button is released ...
    expect(await app.eval<string | null>(`${LAMP}`)).toBe('on');
    await app.until('the lamp off after PT', `${LAMP} === 'off'`);
    const elapsed = (await app.eval<number>(`performance.now()`)) - fell;
    expect(elapsed).toBeGreaterThan(250);
    expect(elapsed).toBeLessThan(2000);
    await app.until('power gone from the coil', `${POWERED('0,7')} === 'false'`);
  });

  test('a push input is held by the keyboard (Space) and let go on key up; the lab ends the run on Reset', async () => {
    const app = await browserApp();
    await mount(app);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    await app.eval(`document.querySelector('[data-lab-input="Button"]').focus()`);
    const key = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
    await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', text: ' ', ...key });
    await app.until('the lamp on while Space is held', `${LAMP} === 'on'`);
    expect(await app.eval<string | null>(`document.querySelector('[data-lab-input="Button"]').getAttribute('data-pressed')`)).toBe('true');
    await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await app.until('the lamp off after PT', `${LAMP} === 'off'`);
    expect(await app.eval<string | null>(`document.querySelector('[data-lab-input="Button"]').getAttribute('data-pressed')`)).toBe('false');

    await app.click('[data-lab-control="reset"]');
    await app.until('the lab idle after Reset', `${STATUS} === 'idle'`);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running again', `${STATUS} === 'running'`);
    await app.click('[data-lab-control="pause"]');
    await app.until('the lab paused', `${STATUS} === 'paused'`);
  });

  test('a switch input toggles with aria-pressed and holds the lamp until it is switched off', async () => {
    const app = await browserApp();
    await mount(app, { ...DATA, inputs: [{ name: 'Button', kind: 'switch' }] });
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    await app.click('[data-lab-input="Button"]');
    await app.until('the switch pressed', `document.querySelector('[data-lab-input="Button"]').getAttribute('aria-pressed') === 'true'`);
    await app.until('the lamp on', `${LAMP} === 'on'`);
    await Bun.sleep(700);
    expect(await app.eval<string | null>(LAMP)).toBe('on');
    await app.click('[data-lab-input="Button"]');
    await app.until('the lamp off after PT', `${LAMP} === 'off'`);
  });

  test('draws the live timing chart of the run with a table of the same changes', async () => {
    const app = await browserApp();
    await mount(app);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    await press(app, '[data-lab-input="Button"]');
    await app.until('the lamp on', `${LAMP} === 'on'`);
    await release(app, '[data-lab-input="Button"]');
    await app.until('the lamp off', `${LAMP} === 'off'`);
    await app.until(
      'the Light edges in the table',
      `[...document.querySelectorAll('[data-reading-block="timing"] tbody tr')]` +
        ".filter((row) => row.cells[0].textContent === 'Light').length >= 3",
    );
    expect(await app.eval<number>(`document.querySelectorAll('[data-reading-block="timing"] svg path').length`)).toBeGreaterThanOrEqual(2);
  });

  test('closes its session when the page closes', async () => {
    const app = await browserApp();
    await mount(app);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    expect(await app.eval<boolean[]>(`${HARNESS}.then((h) => h.labsClosed())`)).toEqual([false]);
    await app.eval(`${HARNESS}.then((h) => { h.unmountLab(); return true; })`);
    await app.until('the lab closed', `${HARNESS}.then((h) => h.labsClosed().then((closed) => closed.every(Boolean)))`);
    expect(await app.eval<string | null>(`document.querySelector('[data-reading-block="ld-try"]')`)).toBeNull();
  });

  test('an input that is a plain variable of the program holds across scans and drives the output', async () => {
    const app = await browserApp();
    await mount(app, DATA, OFF_DELAY_VAR);
    await app.click('[data-lab-control="run"]');
    await app.until('the lab running', `${STATUS} === 'running'`);
    await app.until('the lamp read off', `${LAMP} === 'off'`);
    await press(app, '[data-lab-input="Button"]');
    await app.until('the lamp on', `${LAMP} === 'on'`);
    await Bun.sleep(600);
    expect(await app.eval<string | null>(LAMP)).toBe('on');
    expect(await app.eval<string | null>(POWERED('0,7'))).toBe('true');
    await release(app, '[data-lab-input="Button"]');
    await app.until('the lamp off after PT', `${LAMP} === 'off'`);
  });
});
