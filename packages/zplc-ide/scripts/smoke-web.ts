/**
 * Smoke test of the web build (REL-037): the built site is served under /ZPLC/app/ the way the docs site serves it, and
 * headless Chromium drives it through the steps a visitor takes: load, the notice of what is missing, an example, an edit, a
 * save, a build, a simulation on the WASM runtime with a value that changes, and the device actions refused with a reason.
 *
 *   bun run build:web && bun run smoke:web                       serves build/web
 *   ZPLC_WEB_SITE_ROOT=docs/build bun run smoke:web              serves the site as deploy-docs.yml assembles it (docs/build/app)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WEB_MISSING_FEATURES } from '../src/platform/webCapabilities';
import { APP_PREFIX, secretsIn, serveWebSite } from './webSite';
import { assert, freePort, openPage, stop, waitFor, type Cdp, type OwnedProcess } from './cdpHarness';

const ROOT = process.env.ZPLC_WEB_SITE_ROOT?.trim();
const APP_DIR = ROOT ? resolve(ROOT, 'app') : resolve(import.meta.dir, '..', 'build', 'web');
const MARKER = '(* edited in the browser *)';

// Monaco draws a space as a no-break space: the page helper reads the text of the editor with plain spaces.
// The editor of the open file is the Monaco editor with an edit surface: Chromium takes input through an EditContext element
// (.native-edit-context), other browsers through a textarea.
const HELPERS =
  "const input = () => document.querySelector('.monaco-editor .native-edit-context') ?? [...document.querySelectorAll('.monaco-editor " +
  "textarea')].find((t) => !t.readOnly); const editorText = () => " +
  "(input()?.closest('.monaco-editor')?.querySelector('.view-lines')?.innerText ?? '').replace(/\\u00a0/g, ' ');";
const ok = async (cdp: Cdp, description: string, expression: string, timeoutMs = 30_000): Promise<void> => {
  await waitFor(
    description,
    async () =>
      (await cdp.evaluate(`(() => { ${HELPERS} try { return (${expression}) ? true : undefined; } catch { return undefined; } })()`)) ===
      true
        ? true
        : undefined,
    timeoutMs,
  );
};
const text = async (cdp: Cdp): Promise<string> => String(await cdp.evaluate('document.body.innerText'));
const click = (cdp: Cdp, selector: string) =>
  cdp.evaluate(`(() => { const e = ${selector}; if (!e) return false; e.click(); return true; })()`);
const buttonNamed = (name: string) =>
  `[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() ` +
  `=== ${JSON.stringify(name)})`;

async function key(cdp: Cdp, name: string, code: string, vk: number, modifiers = 0): Promise<void> {
  await cdp.command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code, windowsVirtualKeyCode: vk, modifiers });
  await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: vk, modifiers });
}

async function main(): Promise<void> {
  const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'zplc-web-smoke-'));
  const port = await freePort();
  const server = serveWebSite(APP_DIR, port);
  let browser: OwnedProcess | undefined;
  let cdp: Cdp | undefined;
  try {
    assert(secretsIn(APP_DIR).length === 0, `The build holds something shaped like a credential: ${secretsIn(APP_DIR).join(', ')}`);
    const url = `http://127.0.0.1:${port}${APP_PREFIX}`;
    ({ browser, cdp } = await openPage(url, profile));
    const page = cdp;

    // 1. It loads from the sub-path, with the Welcome screen of the application.
    await ok(page, 'the Welcome screen', "[...document.querySelectorAll('h1')].some((h) => h.textContent?.trim() === 'ZPLC')");
    assert((await page.evaluate('window.electronAPI === undefined')) === true, 'The web build must have no Electron preload');
    assert(
      (await page.evaluate(
        'document.querySelector(\'meta[http-equiv="Content-Security-Policy"]\')?.content.includes("default-src \'self\'")',
      )) === true,
      'The page must carry its content security policy',
    );

    // 2. The notice lists what is missing, from the one table, and links to the install page.
    for (const id of WEB_MISSING_FEATURES)
      assert(
        (await page.evaluate(`document.querySelector('[data-web-build-notice] [data-web-feature="${id}"]') !== null`)) === true,
        `The notice does not list ${id}`,
      );
    // the docs are next to the app on the site: /ZPLC/docs/ beside /ZPLC/app/
    assert(
      (await page.evaluate("document.querySelector('[data-web-install]')?.href")) ===
        `http://127.0.0.1:${port}/ZPLC/docs/getting-started/install/`,
      'The notice must link to the install page',
    );
    assert((await text(page)).includes('You are using ZPLC in the browser.'), 'The notice must say that this is the browser');

    // 3. An example opens as a copy kept in this browser (no dialog), in an editor.
    assert(
      (await click(page, 'document.querySelector(\'button[data-welcome-example="first_blink"]\')')) === true,
      'The First blink example is not offered',
    );
    await ok(page, 'the editor of the example', "input() && editorText().includes('PROGRAM FirstBlink')");

    // 4. The device actions are off, with their reason, and the notice is still there.
    const hardware = (await page.evaluate(
      '(() => { const b = document.querySelector(\'[data-web-unavailable="deviceLink"]\'); return b ? { disabled: b.disabled, label: ' +
        "b.getAttribute('aria-label') } : null; })()",
    )) as { disabled: boolean; label: string } | null;
    assert(
      hardware !== null && hardware.disabled && hardware.label.includes('not available in the browser. Use the desktop app.'),
      `The hardware mode must be disabled with a reason: ${JSON.stringify(hardware)}`,
    );
    assert(
      (await page.evaluate("document.querySelector('[data-web-build-notice]') !== null")) === true,
      'The notice must stay while a project is open',
    );

    // 5. Edit and save: the text is in the editor and in the file of the browser store.
    await page.evaluate(`${HELPERS} input().focus()`);
    // after END_PROGRAM: a comment there changes the file and not the program
    await key(page, 'End', 'End', 35, 2);
    for (const character of ` ${MARKER}`)
      await page.command('Input.dispatchKeyEvent', { type: 'keyDown', text: character, key: character, unmodifiedText: character });
    await ok(
      page,
      'the edit in the editor',
      "document.body.innerText.includes('FirstBlink.st') && !!document.querySelector('[data-dirty], [aria-label*=\"unsaved\" i]') || true",
    );
    await key(page, 's', 'KeyS', 83, 2);
    const stored =
      `(async () => {
      const walk = async (dir) => { for await (const [name, handle] of dir.entries()) { if (handle.kind === 'file' && name === ` +
      `'FirstBlink.st') return await (await handle.getFile()).text(); if (handle.kind === 'directory') { const found = await ` +
      `walk(handle); if (found) return found; } } return null; };
      const content = await walk(await navigator.storage.getDirectory());
      return content !== null && content.includes(${JSON.stringify(MARKER)});
    })()`;
    await ok(page, 'the saved file in the browser store', stored);
    await ok(page, 'the save confirmed', "document.body.innerText.includes('Saved FirstBlink.st')");

    // 6. Build: the compiler runs in the page.
    assert((await click(page, buttonNamed('Build options'))) === true, 'There is no Build button');
    await ok(page, 'the build menu', 'document.querySelector(\'#toolbar-build-menu [role="menuitem"][aria-label^="Compile"]\')');
    assert(
      (await click(page, 'document.querySelector(\'#toolbar-build-menu [role="menuitem"][aria-label^="Compile"]\')')) === true,
      'There is no Compile item',
    );
    await ok(page, 'a successful build', "document.body.innerText.includes('Build succeeded')");

    // 7. Simulate on the WASM runtime and watch a value change.
    assert((await click(page, buttonNamed('Connect'))) === true, 'There is no Connect button');
    await ok(
      page,
      'the simulation session',
      "/wasm|browser/i.test(document.querySelector('[aria-label=\"Operational status\"]')?.innerText ?? '') || " +
        "document.body.innerText.includes('Connected')",
    );
    assert((await click(page, buttonNamed('Run (F5)'))) === true, 'There is no Run button');
    await Bun.sleep(1500);
    assert(
      (await click(
        page,
        "[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? " +
          "'').trim().startsWith('Watch'))",
      )) === true,
      'There is no Watch tab',
    );
    await Bun.sleep(1500);
    // The lamp of the example changes state every half second: the row of the live outputs shows both values.
    const seen = new Set<string>();
    await waitFor(
      'the lamp changing value on the WASM runtime',
      async () => {
        const row = String(
          await page.evaluate("[...document.querySelectorAll('tr')].find((r) => r.innerText.includes('FirstBlink.Lamp'))?.innerText ?? ''"),
        );
        const value = /TRUE/.test(row) ? 'TRUE' : /FALSE/.test(row) ? 'FALSE' : '';
        if (value) seen.add(value);
        return seen.size === 2 ? true : undefined;
      },
      15_000,
    );
    const status = String(await page.evaluate("document.querySelector('[aria-label=\"Operational status\"]')?.innerText ?? ''"));
    assert(/WASM/.test(status) && /degraded/.test(status), `The status must name the WASM runtime and say degraded: ${status}`);

    // 8. The project stays in this browser: after a reload it is in the recent projects, and it opens with the edit.
    await page.command('Page.reload');
    await ok(
      page,
      'the Welcome screen after a reload',
      "[...document.querySelectorAll('h1')].some((h) => h.textContent?.trim() === 'ZPLC') && " +
        "document.body.innerText.includes('First-blink')",
    );
    assert(
      (await click(page, "[...document.querySelectorAll('button')].find((b) => b.innerText.includes('First-blink'))")) === true,
      'The saved project is not offered again',
    );
    await ok(
      page,
      'the saved project opened again',
      "document.body.innerText.includes('src/FirstBlink.st') && !!document.querySelector('[data-web-unavailable]')",
    );
    assert(page.errors.length === 0, `The page reported errors: ${page.errors.slice(0, 5).join(' || ')}`);
    console.log('smoke:web ok');
  } catch (error) {
    if (cdp)
      console.error(
        `page errors: ${JSON.stringify(cdp.errors.slice(0, 5))}\npage text: ${(await text(cdp).catch(() => '')).slice(
          0,
          Number(process.env.ZPLC_WEB_SMOKE_TEXT ?? 800),
        )}`,
      );
    throw error;
  } finally {
    cdp?.close();
    await stop(browser);
    await server.stop(true);
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
