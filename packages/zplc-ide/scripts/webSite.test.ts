import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appFile, secretsIn } from './webSite';

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

  test('REL-037: finds a credential in the build and finds nothing in an ordinary bundle', () => {
    const clean = mkdtempSync(join(tmpdir(), 'zplc-web-clean-'));
    writeFileSync(join(clean, 'a.js'), 'const label = "API key"; const x = "AKIABBADOABIAAQQA7AQ"; fetch("/ZPLC/app/x")');
    expect(secretsIn(clean)).toEqual([]);
    const leaky = mkdtempSync(join(tmpdir(), 'zplc-web-leaky-'));
    mkdirSync(join(leaky, 'assets'));
    writeFileSync(join(leaky, 'assets', 'b.js'), `const t = "ghp_${'a1B2'.repeat(9)}";`);
    writeFileSync(join(leaky, 'c.html'), '-----BEGIN RSA PRIVATE KEY-----');
    expect(secretsIn(leaky).sort()).toEqual(['assets/b.js: GitHub token', 'c.html: private key']);
  });
});
