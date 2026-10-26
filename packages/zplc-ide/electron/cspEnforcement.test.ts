// The production policy, enforced by a real Chromium (IDE-016, IDE-028). security.test.ts pins the text of the policy; this
// serves a page under the very header the main process sends to a packaged build and shows what the browser does with it:
// an injected inline script and an inline event handler do not run, a script from the same origin does. It is the unpackaged half
// of the proof: that the packaged application sends this header is shown by the journeys on the packaged app (probeSecurity).
import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { createContentSecurityPolicy } from './security';

function chromium(): string | undefined {
  const explicit = [process.env.ZPLC_CHROMIUM_BIN, process.env.CHROME_BIN].find((path) => {
    try {
      if (path) accessSync(path, constants.X_OK);
      return Boolean(path);
    } catch {
      return false;
    }
  });
  if (explicit) return explicit;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }
  return undefined;
}

const PAGE = `<!doctype html><html><head><title>none</title></head><body>
<script>document.documentElement.setAttribute('data-inline', 'ran');</script>
<img src="zplc-probe-missing.png" onerror="document.documentElement.setAttribute('data-handler', 'ran')">
<script src="/same-origin.js"></script>
</body></html>`;

/** Loads `url` in headless Chromium and returns the document, or undefined when the browser had not ended after 15 s. */
async function loadOnce(browser: string, url: string): Promise<string | undefined> {
  const profile = mkdtempSync(join(tmpdir(), 'zplc-csp-'));
  try {
    const run = Bun.spawn(
      [
        browser,
        '--headless=new',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        `--user-data-dir=${profile}`,
        '--virtual-time-budget=4000',
        '--dump-dom',
        url,
      ],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const dom = new Response(run.stdout).text().catch(() => '');
    const timer = setTimeout(() => run.kill('SIGKILL'), 15_000);
    await run.exited;
    clearTimeout(timer);
    // A child of a killed browser can keep its output open, so the text of a killed run is not awaited.
    return run.signalCode === null ? await dom : undefined;
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Serves PAGE under `policy`, loads it in headless Chromium and returns the document as the browser ended up with it. */
async function dumpDom(browser: string, policy: string): Promise<string> {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/same-origin.js')
        return new Response("document.documentElement.setAttribute('data-external', 'ran');", {
          headers: { 'Content-Type': 'text/javascript' },
        });
      if (path === '/') return new Response(PAGE, { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': policy } });
      return new Response('', { status: 404 });
    },
  });
  const url = `http://127.0.0.1:${server.port}/`;
  try {
    // Headless Chromium on a CI runner now and then never ends (ZPLC CI run 40371555162); a second run tells that apart from a
    // page that does not load. A browser that ends is never retried, so a policy that breaks the page still fails.
    return (await loadOnce(browser, url)) ?? (await loadOnce(browser, url)) ?? '';
  } finally {
    await server.stop(true);
  }
}

const browser = chromium();

describe('the production content security policy in Chromium (IDE-016)', () => {
  test.skipIf(browser === undefined)(
    'lets a script of the application run and blocks an injected inline script and inline event handler',
    async () => {
      const dom = await dumpDom(browser!, createContentSecurityPolicy(false));
      expect(dom, 'the page did not load').toContain('data-external="ran"');
      expect(dom).not.toContain('data-inline="ran"');
      expect(dom).not.toContain('data-handler="ran"');
    },
    40_000,
  );

  // Without this the test above could pass for a browser that blocks everything or runs nothing: the same page under a policy
  // that allows inline code does run both, so the absence above is the policy's doing.
  test.skipIf(browser === undefined)(
    'the same page under a policy that allows inline code runs both',
    async () => {
      const dom = await dumpDom(browser!, "default-src 'self'; script-src 'self' 'unsafe-inline'");
      expect(dom).toContain('data-inline="ran"');
      expect(dom).toContain('data-handler="ran"');
      expect(dom).toContain('data-external="ran"');
    },
    40_000,
  );
});
