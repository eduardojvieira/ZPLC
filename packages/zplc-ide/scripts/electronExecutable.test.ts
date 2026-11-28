import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { electronExecutable } from './run-desktop-smoke';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fakePackage(pathTxt?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-electron-path-'));
  roots.push(root);
  mkdirSync(join(root, 'node_modules', 'electron'), { recursive: true });
  if (pathTxt !== undefined) writeFileSync(join(root, 'node_modules', 'electron', 'path.txt'), pathTxt);
  return root;
}

describe('the Electron executable of the smoke and journey scripts', () => {
  it('is dist/ plus the path that the electron install wrote, so macOS gets the binary inside Electron.app', () => {
    const root = fakePackage('Electron.app/Contents/MacOS/Electron');
    expect(electronExecutable(root)).toBe(join(root, 'node_modules', 'electron', 'dist', 'Electron.app/Contents/MacOS/Electron'));
  });

  it('names electron.exe on Windows and electron on Linux the same way', () => {
    expect(electronExecutable(fakePackage('electron.exe')).endsWith(join('dist', 'electron.exe'))).toBe(true);
    expect(electronExecutable(fakePackage('electron')).endsWith(join('dist', 'electron'))).toBe(true);
  });

  it('says to run bun install when the electron package has no path.txt, and downloads nothing', () => {
    const root = fakePackage();
    expect(() => electronExecutable(root)).toThrow('Installed Electron executable is missing. Run bun install first.');
    expect(existsSync(join(root, 'node_modules', 'electron', 'dist'))).toBe(false);
  });
});
