// REL-018, REL-019: the lockfile reader both the bill of materials and the licence notices stand on.
import { describe, expect, test } from 'bun:test';
import { integrityHex, keyChain, parseLockfile, productionClosure, resolveDependency, splitId, stripTrailingCommas } from './lockfile';

const FIXTURE = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "root", "devDependencies": { "typescript": "^5", }, },
    "packages/app": {
      "name": "@fx/app",
      "dependencies": { "left": "^1", "@fx/lib": "workspace:*", },
      "devDependencies": { "tool": "^2", },
    },
    "packages/lib": { "name": "@fx/lib", "dependencies": { "shared": "^3", }, },
  },
  "packages": {
    "@fx/app": ["@fx/app@workspace:packages/app"],
    "@fx/lib": ["@fx/lib@workspace:packages/lib"],
    "left": ["left@1.0.0", "", { "dependencies": { "shared": "^2", "@sc/pkg": "^1" }, "optionalDependencies": { "fast": "^1" } }, "sha512-AAAA"],
    "left/shared": ["shared@2.0.0", "", {}, "sha512-BBBB"],
    "shared": ["shared@3.0.0", "", {}, "sha512-CCCC"],
    "@sc/pkg": ["@sc/pkg@1.2.3", "", { "peerDependencies": { "peer": "*", "soft": "*" }, "optionalPeers": ["soft"] }, "sha512-DDDD"],
    "peer": ["peer@4.0.0", "", {}, "sha512-EEEE"],
    "soft": ["soft@5.0.0", "", {}, "sha512-FFFF"],
    "fast": ["fast@1.0.0", "", {}, "sha512-GGGG"],
    "tool": ["tool@2.0.0", "", {}, "sha512-HHHH"],
    "typescript": ["typescript@5.9.3", "", {}, "sha512-IIII"],
  }
}`;

describe('stripTrailingCommas (REL-018, REL-019)', () => {
  test('removes the commas before a closing bracket and leaves strings alone', () => {
    const text = '{"a": [1, 2, ], "b": "x,]y", "c": {"d": "\\",}",},}';
    expect(JSON.parse(stripTrailingCommas(text))).toEqual({ a: [1, 2], b: 'x,]y', c: { d: '",}' } });
  });
});

describe('lockfile keys and ids (REL-018, REL-019)', () => {
  test('a scoped name is one element of the chain', () => {
    expect(keyChain('@babel/core/semver')).toEqual(['@babel/core', 'semver']);
    expect(keyChain('a/@s/b/c')).toEqual(['a', '@s/b', 'c']);
  });
  test('an id splits at its last @', () => {
    expect(splitId('@sc/pkg@1.2.3')).toEqual({ name: '@sc/pkg', version: '1.2.3' });
    expect(splitId('@fx/app@workspace:packages/app')).toEqual({ name: '@fx/app', version: 'workspace:packages/app' });
  });
  test('integrity becomes a hex digest', () => {
    expect(integrityHex('sha512-AAAA')).toEqual({ alg: 'SHA-512', content: '000000' });
    expect(integrityHex('not-an-integrity')).toBeUndefined();
  });
});

describe('the lockfile dependency graph (REL-018, REL-019)', () => {
  const lock = parseLockfile(FIXTURE);

  test('a nested key wins over the top level for the package it is nested under', () => {
    expect(resolveDependency(lock, ['left'], 'shared')?.version).toBe('2.0.0');
    expect(resolveDependency(lock, ['@fx/lib'], 'shared')?.version).toBe('3.0.0');
    expect(resolveDependency(lock, ['left'], 'absent')).toBeUndefined();
  });

  test('the production closure follows dependencies, optional dependencies, required peers and workspace packages', () => {
    const { packages, unresolved } = productionClosure(lock, 'packages/app');
    expect(unresolved).toEqual([]);
    expect(packages.map((entry) => entry.id)).toEqual([
      '@fx/lib@workspace:packages/lib', '@sc/pkg@1.2.3', 'fast@1.0.0', 'left@1.0.0', 'shared@2.0.0', 'peer@4.0.0', 'shared@3.0.0',
    ]);
  });

  test('a development dependency is outside the production closure and inside the development one', () => {
    expect(productionClosure(lock, 'packages/app').packages.some((entry) => entry.name === 'tool')).toBe(false);
    expect(productionClosure(lock, 'packages/app', { includeDev: true }).packages.some((entry) => entry.name === 'tool')).toBe(true);
  });

  test('a dependency the lockfile cannot resolve is reported, not skipped', () => {
    const broken = parseLockfile(FIXTURE.replace('"fast": ["fast@1.0.0", "", {}, "sha512-GGGG"],', ''));
    expect(productionClosure(broken, 'packages/app').unresolved).toEqual(['left -> fast']);
  });
});
