// REL-018: the bill of materials is generated from the lockfile, the workspace manifests and the west manifest, and a
// build with fewer components than the lockfile lists, or than the recorded floor, fails.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLockfile } from './lockfile';
import { buildSbom, checkSbom, npmPurl, westProjects } from './sbom';

const root = join(import.meta.dir, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const LOCK = `{
  "workspaces": {
    "": { "name": "root" },
    "packages/app": { "name": "@fx/app", "version": "1.0.0", "dependencies": { "left": "^1" }, "devDependencies": { "tool": "^2" } }
  },
  "packages": {
    "@fx/app": ["@fx/app@workspace:packages/app"],
    "left": ["left@1.0.0", "", { "dependencies": { "@sc/pkg": "^1" } }, "sha512-AAAA"],
    "@sc/pkg": ["@sc/pkg@1.2.3", "", {}, "sha512-BBBB"],
    "tool": ["tool@2.0.0", "", {}, "sha512-CCCC"],
    "app-only/tool": ["tool@2.0.0", "", {}, "sha512-CCCC"],
  }
}`;
const WEST = `manifest:
  version: "1.2"
  projects:
    - name: zephyr
      url: https://github.com/zephyrproject-rtos/zephyr
      revision: dccb09599635bdff17633fa7e9dab014b91dce90
      import: true
  self:
    path: zplc
`;
const input = {
  lockText: LOCK,
  workspaceManifests: { 'packages/app': { name: '@fx/app', version: '1.0.0' } },
  westText: WEST,
  productVersion: '2.0.0-rc.4',
};

describe('buildSbom (REL-018)', () => {
  const sbom = buildSbom(input);
  const byPurl = new Map(sbom.components.map((component) => [component.purl, component]));

  test('is a CycloneDX 1.5 document for the product at the given version', () => {
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.specVersion).toBe('1.5');
    expect((sbom.metadata as { component: { name: string; version: string } }).component).toMatchObject({
      name: 'zplc',
      version: '2.0.0-rc.4',
    });
  });

  test('lists each locked package once, even when the lockfile keeps it under two keys', () => {
    expect(sbom.components.filter((component) => component.name === 'tool')).toHaveLength(1);
    expect(byPurl.get('pkg:npm/left@1.0.0')?.name).toBe('left');
  });

  test('writes a scoped name with the scope percent-encoded, as the purl specification asks', () => {
    expect(npmPurl('@sc/pkg', '1.2.3')).toBe('pkg:npm/%40sc/pkg@1.2.3');
    expect(byPurl.has('pkg:npm/%40sc/pkg@1.2.3')).toBe(true);
  });

  test('carries the integrity of the lockfile as a hash', () => {
    expect((byPurl.get('pkg:npm/left@1.0.0') as { hashes?: unknown }).hashes).toEqual([{ alg: 'SHA-512', content: '000000' }]);
  });

  test('marks what the application needs as required and the build tooling as excluded', () => {
    expect(byPurl.get('pkg:npm/left@1.0.0')?.scope).toBe('required');
    expect(byPurl.get('pkg:npm/%40sc/pkg@1.2.3')?.scope).toBe('required');
    expect(byPurl.get('pkg:npm/tool@2.0.0')?.scope).toBe('excluded');
  });

  test('lists the workspace packages and the projects of the west manifest', () => {
    expect(byPurl.has('pkg:generic/%40fx/app@1.0.0')).toBe(true);
    expect(byPurl.get('pkg:github/zephyrproject-rtos/zephyr@dccb09599635bdff17633fa7e9dab014b91dce90')?.name).toBe('zephyr');
  });

  test('is the same bytes for the same inputs', () => {
    expect(JSON.stringify(buildSbom(input))).toBe(JSON.stringify(buildSbom(input)));
  });
});

describe('westProjects (REL-018)', () => {
  test('resolves the url of a project through the remote of an imported manifest', () => {
    const text = `manifest:
  remotes:
    - name: upstream
      url-base: https://github.com/zephyrproject-rtos
  projects:
    - name: hal_rpi_pico
      remote: upstream
      revision: abc123
      path: modules/hal/rpi_pico
    - name: cmsis
      repo-path: CMSIS_5
      remote: upstream
      revision: def456
`;
    expect(westProjects(text).map(({ name, url, revision }) => ({ name, url, revision }))).toEqual([
      { name: 'hal_rpi_pico', url: 'https://github.com/zephyrproject-rtos/hal_rpi_pico', revision: 'abc123' },
      { name: 'cmsis', url: 'https://github.com/zephyrproject-rtos/CMSIS_5', revision: 'def456' },
    ]);
  });
});

describe('checkSbom (REL-018)', () => {
  const sbom = buildSbom(input);
  const lock = parseLockfile(LOCK);

  test('passes when the document holds every package the lockfile lists and meets the floor', () => {
    expect(checkSbom(sbom, { lock, floor: 3 })).toEqual([]);
  });

  test('fails when it holds fewer packages than the lockfile lists', () => {
    const fewer = { ...sbom, components: sbom.components.filter((component) => component.name !== 'left') };
    expect(checkSbom(fewer, { lock, floor: 0 }).join('\n')).toMatch(/lists 3 packages but the document holds 2/);
    expect(checkSbom(fewer, { lock, floor: 0 }).join('\n')).toMatch(/left@1\.0\.0/);
  });

  test('fails when it holds fewer components than the recorded floor', () => {
    expect(checkSbom(sbom, { lock, floor: 99 }).join('\n')).toMatch(/floor of 99/);
  });
});

describe('the repository bill of materials (REL-018)', () => {
  test('holds every locked package, and the recorded floor is not above it', () => {
    const lock = parseLockfile(read('bun.lock'));
    const floor = (JSON.parse(read('scripts/release/sbom-floor.json')) as { components: number }).components;
    const manifests = Object.fromEntries(
      [...lock.workspaces.keys()].filter(Boolean).map((path) => [path, JSON.parse(read(`${path}/package.json`))]),
    );
    const sbom = buildSbom({
      lockText: read('bun.lock'),
      workspaceManifests: manifests,
      westText: read('west.yml'),
      productVersion: JSON.parse(read('package.json')).version,
    });
    expect(checkSbom(sbom, { lock, floor })).toEqual([]);
    expect(sbom.components.length).toBeGreaterThanOrEqual(floor);
  });

  test('the command line fails on a document with fewer packages and passes on a complete one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-sbom-'));
    const complete = join(directory, 'complete.cdx.json');
    const written = spawnSync('bun', ['scripts/release/sbom.ts', '--out', complete], { cwd: root, encoding: 'utf8' });
    expect(written.status, written.stderr).toBe(0);
    const verified = spawnSync('bun', ['scripts/release/sbom.ts', '--verify', complete], { cwd: root, encoding: 'utf8' });
    expect(verified.status, verified.stderr).toBe(0);

    const document = JSON.parse(readFileSync(complete, 'utf8')) as { components: unknown[] };
    document.components = document.components.slice(0, document.components.length - 5);
    const truncated = join(directory, 'truncated.cdx.json');
    writeFileSync(truncated, JSON.stringify(document));
    const refused = spawnSync('bun', ['scripts/release/sbom.ts', '--verify', truncated], { cwd: root, encoding: 'utf8' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/bun\.lock lists \d+ packages but the document holds \d+/);
  });
});
