// REL-019: the third-party notices are generated from the lockfile and the installed packages, and they cover the
// fonts that the build bundles.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLockfile } from './lockfile';
import { bundledDevDependencies, collectNotices, findFonts, matchFonts, renderNotices, type FontRegistry } from './licenses';

const LOCK =
  `{
  "workspaces": {
    "": { "name": "root" },
    "packages/app": { "name": "@fx/app", "dependencies": { "left": "^1", "@sc/pkg": "^1" }, "devDependencies": { "editor": "^1", "tool": ` +
  `"^1" } }
  },
  "packages": {
    "@fx/app": ["@fx/app@workspace:packages/app"],
    "left": ["left@1.0.0", "", { "dependencies": { "deep": "^1" } }, "sha512-AAAA"],
    "deep": ["deep@2.0.0", "", {}, "sha512-BBBB"],
    "@sc/pkg": ["@sc/pkg@1.2.3", "", {}, "sha512-CCCC"],
    "editor": ["editor@1.0.0", "", {}, "sha512-DDDD"],
    "tool": ["tool@1.0.0", "", {}, "sha512-EEEE"],
  }
}`;

let root = '';
function install(path: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): void {
  mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, path, 'package.json'), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, path, name), text);
}

function installAll(): void {
  install(
    'node_modules/left',
    { name: 'left', version: '1.0.0', license: 'MIT', repository: { url: 'git+https://example.test/left.git' } },
    { LICENSE: 'Copyright (c) Left Authors\nMIT text' },
  );
  install(
    'node_modules/deep',
    { name: 'deep', version: '2.0.0', licenses: [{ type: 'BSD-3-Clause' }] },
    { 'LICENSE.md': 'Deep BSD text', NOTICE: 'Deep notice' },
  );
  install('node_modules/@sc/pkg', {
    name: '@sc/pkg',
    version: '1.2.3',
    license: { type: 'Apache-2.0' },
    homepage: 'https://sc.example.test',
  });
  install('node_modules/editor', { name: 'editor', version: '1.0.0', license: 'MIT' }, { LICENSE: 'Editor text' });
  install('node_modules/tool', { name: 'tool', version: '1.0.0', license: 'GPL-3.0' }, { LICENSE: 'tool text' });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'zplc-licenses-'));
  installAll();
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('collectNotices (REL-019)', () => {
  test('covers the production closure and the named bundled packages, and not the build tooling', () => {
    const { notices, missing } = collectNotices({
      repoRoot: root,
      lock: parseLockfile(LOCK),
      workspacePath: 'packages/app',
      bundled: ['editor'],
    });
    expect(missing).toEqual([]);
    expect(notices.map((notice) => `${notice.name}@${notice.version}`)).toEqual([
      '@sc/pkg@1.2.3',
      'deep@2.0.0',
      'editor@1.0.0',
      'left@1.0.0',
    ]);
  });

  test('reads the licence from the three forms package.json has, with its text', () => {
    const { notices } = collectNotices({ repoRoot: root, lock: parseLockfile(LOCK), workspacePath: 'packages/app', bundled: [] });
    const by = Object.fromEntries(notices.map((notice) => [notice.name, notice]));
    expect(by.left).toMatchObject({ license: 'MIT', repository: 'https://example.test/left' });
    expect(by.left?.text).toContain('Copyright (c) Left Authors');
    expect(by.deep?.license).toBe('BSD-3-Clause');
    expect(by.deep?.text).toContain('Deep BSD text');
    expect(by.deep?.text).toContain('Deep notice');
    expect(by['@sc/pkg']).toMatchObject({ license: 'Apache-2.0', homepage: 'https://sc.example.test' });
    expect(by['@sc/pkg']?.text).toBeUndefined();
  });

  test('reports a package that is locked but not installed, and one with no licence field', () => {
    rmSync(join(root, 'node_modules/deep'), { recursive: true });
    install('node_modules/left', { name: 'left', version: '1.0.0' }, { LICENSE: 'x' });
    const { missing, notices } = collectNotices({ repoRoot: root, lock: parseLockfile(LOCK), workspacePath: 'packages/app', bundled: [] });
    expect(missing).toEqual(['deep@2.0.0 is locked but not installed']);
    expect(notices.find((notice) => notice.name === 'left')?.license).toBe('UNKNOWN');
    installAll();
  });
});

describe('bundledDevDependencies (REL-019)', () => {
  test('is the declared development dependencies that the renderer sources import', () => {
    const imports = [
      "import { a } from 'editor';",
      "import b from '@sc/pkg/sub';",
      "import c from './local';",
      "const d = await import('tool-not-imported-here');",
    ];
    expect(bundledDevDependencies(imports, ['editor', 'tool', 'tool-not-imported-here'])).toEqual(['editor', 'tool-not-imported-here']);
  });
});

describe('fonts (REL-019)', () => {
  const registry: FontRegistry = {
    schema: 1,
    fonts: [
      {
        pattern: '^codicon-[A-Za-z0-9_-]+\\.ttf$',
        name: 'Codicons',
        licence: 'CC-BY-4.0',
        source: 'https://github.com/microsoft/vscode-codicons',
        copyright: 'Copyright (c) Microsoft Corporation',
      },
    ],
  };

  test('finds the font files of a tree', () => {
    mkdirSync(join(root, 'dist/assets'), { recursive: true });
    writeFileSync(join(root, 'dist/assets/codicon-ngg6Pgfi.ttf'), 'font');
    writeFileSync(join(root, 'dist/assets/Inter-Var.woff2'), 'font');
    writeFileSync(join(root, 'dist/assets/index.js'), 'js');
    expect(findFonts(join(root, 'dist')).sort()).toEqual(['assets/Inter-Var.woff2', 'assets/codicon-ngg6Pgfi.ttf']);
  });

  test('records the licence of a known font and refuses a font with no record', () => {
    const { fonts, unknown } = matchFonts(['assets/Inter-Var.woff2', 'assets/codicon-ngg6Pgfi.ttf'], registry);
    expect(fonts.map((font) => [font.file, font.licence])).toEqual([['assets/codicon-ngg6Pgfi.ttf', 'CC-BY-4.0']]);
    expect(unknown).toEqual(['assets/Inter-Var.woff2']);
  });
});

describe('renderNotices (REL-019)', () => {
  test('writes every package with its licence and text, the fonts, and no date, so the file is reproducible', () => {
    const { notices } = collectNotices({ repoRoot: root, lock: parseLockfile(LOCK), workspacePath: 'packages/app', bundled: [] });
    const text = renderNotices({
      product: 'ZPLC',
      version: '2.0.0-rc.4',
      notices,
      fonts: [
        {
          file: 'assets/codicon-ngg6Pgfi.ttf',
          name: 'Codicons',
          licence: 'CC-BY-4.0',
          source: 'https://github.com/microsoft/vscode-codicons',
          copyright: 'Copyright (c) Microsoft Corporation',
        },
      ],
    });
    expect(text).toContain('ZPLC 2.0.0-rc.4');
    expect(text).toContain('left@1.0.0');
    expect(text).toContain('License: MIT');
    expect(text).toContain('Copyright (c) Left Authors');
    expect(text).toContain('Codicons');
    expect(text).toContain('CC-BY-4.0');
    expect(text).toContain('LICENSES.chromium.html');
    expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(renderNotices({ product: 'ZPLC', version: '2.0.0-rc.4', notices, fonts: [] })).toBe(
      renderNotices({ product: 'ZPLC', version: '2.0.0-rc.4', notices, fonts: [] }),
    );
  });
});
