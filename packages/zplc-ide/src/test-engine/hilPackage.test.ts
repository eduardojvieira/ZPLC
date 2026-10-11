import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

// The HIL package's own tests (packages/zplc-hil/tests) run with the Studio suite, which CI runs: this file imports them so
// that they are part of it. The test below keeps the list complete, so a test file added there cannot be left out.
import '../../../zplc-hil/tests/cli.test';
import '../../../zplc-hil/tests/guard.test';
import '../../../zplc-hil/tests/hardwarePort.test';
import '../../../zplc-hil/tests/ports.test';
import '../../../zplc-hil/tests/record.test';
import '../../../zplc-hil/tests/runner.test';
import '../../../zplc-hil/tests/shellLink.test';
import '../../../zplc-hil/tests/opcodes/arithmetic.test';
import '../../../zplc-hil/tests/opcodes/control.test';
import '../../../zplc-hil/tests/opcodes/logic.test';
import '../../../zplc-hil/tests/opcodes/memory.test';
import '../../../zplc-hil/tests/opcodes/stack.test';
import '../../../zplc-hil/tests/blocks/timers.test';
import '../../../zplc-hil/tests/blocks/timers_extended.test';

const TESTS = fileURLToPath(new URL('../../../zplc-hil/tests/', import.meta.url));

describe('the HIL package tests run with the Studio suite (HIL-001)', () => {
  test('every test file of packages/zplc-hil is imported by this file', async () => {
    const found = readdirSync(TESTS, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.test.ts')).sort();
    const imported = (await Bun.file(fileURLToPath(import.meta.url)).text()).matchAll(/'\.\.\/\.\.\/\.\.\/zplc-hil\/tests\/([^']+)'/g);
    expect([...imported].map((match) => `${match[1]}.ts`).sort()).toEqual(found);
  });
});
