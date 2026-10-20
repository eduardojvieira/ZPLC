// The port conformance suite of IO-013 names real checks on every port, or says why a leg is open and who owns it.
//
// tools/ci/port-conformance.json lists, for each category the requirement names (per-opcode tests, loader negative
// tests, scheduler phase and fault tests, a timing self-test) and for the two other parts that a port carries (the I/O
// table and non-volatile storage), the suites that run on each port. A suite name that no longer exists, a category
// that leaves a port out without a reason, or a port that the manifest does not know fails here, so that the page
// that tools/docs/generate_port_interface.ts prints from it cannot promise a check that is not there. The WebAssembly
// legs name C suites that tools/wasm-core/suites.ts builds with the HAL port of that runtime, in the same category.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { SUITES } from '../wasm-core/suites';

const ROOT = new URL('../../', import.meta.url).pathname;
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');

interface Leg { ctest?: string[]; twister?: string[]; wasm?: string[]; bun?: Array<{ file: string; test: string }>; open?: { en: string; es: string; owner: string } }
interface Manifest {
  ports: Array<{ id: string; name: { en: string; es: string }; how: { en: string; es: string } }>;
  categories: Array<{ id: string; title: { en: string; es: string }; what: { en: string; es: string }; legs: Record<string, Leg> }>;
}
const manifest = JSON.parse(text('tools/ci/port-conformance.json')) as Manifest;

const ctestNames = new Set([...text('firmware/lib/zplc_core/CMakeLists.txt').matchAll(/add_test\(NAME (\w+)/g)].map((match) => match[1]!));
const scenarioNames = new Set<string>();
for (const name of new Bun.Glob('firmware/tests/*/testcase.yaml').scanSync({ cwd: ROOT })) {
  for (const match of text(name).matchAll(/^ {2}(zplc\.[\w.]+):/gm)) scenarioNames.add(match[1]!);
}

describe('port conformance suite: the legs name real checks (IO-013)', () => {
  it('knows the three ports that the repository ships a runtime for', () => {
    expect(manifest.ports.map((port) => port.id)).toEqual(['posix', 'zephyr', 'wasm']);
  });

  it('has the four categories of the requirement, then the I/O table and the storage', () => {
    expect(manifest.categories.map((category) => category.id)).toEqual(['opcodes', 'loader', 'scheduler', 'timing', 'io-table', 'storage']);
  });

  it('gives every category a leg for every port: suites that exist, or the reason it is open and its owner', () => {
    const ports = manifest.ports.map((port) => port.id);
    for (const category of manifest.categories) {
      expect({ category: category.id, ports: Object.keys(category.legs).sort() }).toEqual({ category: category.id, ports: [...ports].sort() });
      for (const port of ports) {
        const leg = category.legs[port]!;
        if (leg.open) {
          expect({ category: category.id, port, reason: leg.open.en.length > 20 && leg.open.es.length > 20, owner: leg.open.owner.length > 0 }).toEqual({ category: category.id, port, reason: true, owner: true });
          expect({ category: category.id, port, alsoSuites: Boolean(leg.ctest ?? leg.twister ?? leg.wasm ?? leg.bun) }).toEqual({ category: category.id, port, alsoSuites: false });
        } else {
          const count = (leg.ctest?.length ?? 0) + (leg.twister?.length ?? 0) + (leg.wasm?.length ?? 0) + (leg.bun?.length ?? 0);
          expect({ category: category.id, port, suites: count > 0 }).toEqual({ category: category.id, port, suites: true });
        }
      }
    }
  });

  it('names only ctest tests that the core defines, Twister scenarios that firmware/tests defines, WebAssembly suites of the same category, and tests of files that hold them', () => {
    const missing: string[] = [];
    for (const category of manifest.categories) {
      for (const leg of Object.values(category.legs)) {
        for (const name of leg.ctest ?? []) if (!ctestNames.has(name)) missing.push(`${category.id}: ctest ${name}`);
        for (const name of leg.twister ?? []) if (!scenarioNames.has(name)) missing.push(`${category.id}: scenario ${name}`);
        for (const name of leg.wasm ?? []) {
          if (SUITES.find((suite) => suite.name === name)?.category !== category.id) missing.push(`${category.id}: WebAssembly suite ${name}`);
        }
        for (const { file, test } of leg.bun ?? []) {
          if (!existsSync(join(ROOT, file)) || !text(file).includes(test)) missing.push(`${category.id}: ${file} > ${test}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('runs on every port in every category: no leg of the suite is open', () => {
    for (const category of manifest.categories) {
      for (const port of manifest.ports.map((entry) => entry.id)) expect({ category: category.id, port, runs: category.legs[port]!.open === undefined }).toEqual({ category: category.id, port, runs: true });
    }
  });

  it('lists in the WebAssembly legs every suite that tools/wasm-core/suites.ts builds, each once', () => {
    const listed = manifest.categories.flatMap((category) => category.legs.wasm?.wasm ?? []);
    expect([...listed].sort()).toEqual(SUITES.map((suite) => suite.name).sort());
  });

  it('keeps the timing self-test on both ports with the one suite header, so that the two ports ask the same questions', () => {
    const posix = text('firmware/lib/zplc_core/tests/test_port_timing.c');
    const zephyr = text('firmware/tests/port_timing/src/main.c');
    for (const source of [posix, zephyr]) expect(source).toContain('zplc_port_timing_suite.h');
  });
});
