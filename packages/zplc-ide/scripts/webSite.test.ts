import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appFile } from './webSite';

describe('the static server of the web build smoke (REL-037)', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-web-site-'));
  const appDir = join(root, 'app');
  mkdirSync(join(appDir, 'assets'), { recursive: true });
  writeFileSync(join(appDir, 'index.html'), '<html></html>');
  writeFileSync(join(appDir, 'assets', 'a.js'), '1');
  writeFileSync(join(root, 'secret.txt'), 'no');

  test('REL-037: serves the build under /ZPLC/app/ the way the docs site does, with index.html for the folder', () => {
    expect(appFile(appDir, '/ZPLC/app/')).toBe(join(appDir, 'index.html'));
    expect(appFile(appDir, '/ZPLC/app/assets/a.js')).toBe(join(appDir, 'assets', 'a.js'));
  });

  test('REL-037: serves nothing outside the prefix, nothing above the folder and nothing that does not exist', () => {
    expect(appFile(appDir, '/index.html')).toBeNull();
    expect(appFile(appDir, '/ZPLC/app/../secret.txt')).toBeNull();
    expect(appFile(appDir, '/ZPLC/app/%2e%2e/secret.txt')).toBeNull();
    expect(appFile(appDir, '/ZPLC/app/missing.js')).toBeNull();
    expect(appFile(appDir, '/ZPLC/app/assets')).toBeNull();
  });
});
