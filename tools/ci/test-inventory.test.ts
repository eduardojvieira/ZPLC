import { describe, expect, it } from 'bun:test';

import { checkInventory, loadRepository, TEST_FILE, type Inventory, type Workflow } from './test-inventory';

const workflow: Workflow = {
  jobs: {
    typescript: { steps: [{ run: 'bun test ./tools/ci' }, { name: 'uses only', uses: 'actions/checkout@x' }, { run: 'bun run test:ide' }] },
    'docs-and-truth': { steps: [{ run: 'python3 tools/hil/test_a.py\npython3 tools/hil/test_b.py' }] },
  },
};
const inventory: Inventory = {
  runs: [
    { pattern: 'tools/ci/**/*.test.ts', job: 'typescript', command: 'bun test ./tools/ci' },
    { pattern: 'tools/hil/test_{a,b}.py', job: 'docs-and-truth', command: 'python3 tools/hil/test_b.py' },
  ],
  notRunInCi: [{ pattern: 'tools/hil/test_*.py', requirement: 'HIL-004', reason: 'needs a board' }],
};
const files = ['tools/ci/a.test.ts', 'tools/hil/test_a.py', 'tools/hil/test_device.py'];

describe('TEST_FILE', () => {
  it.each([
    'a.test.ts',
    'src/a.test.tsx',
    'scripts/a.test.mjs',
    'tools/hil/test_x.py',
    'tools/x_test.py',
    'test_top.py',
    'firmware/lib/zplc_core/tests/test_isa.c',
    'firmware/tests/azure_sas/src/main.c',
    'firmware/app/tests/test_x.c',
  ])('recognises %s as a test file', (file) => expect(TEST_FILE.test(file)).toBe(true));

  it.each([
    'README.md',
    'src/a.ts',
    'tools/hil/latest_data.py',
    'tools/hil/run_all_hil_tests.py',
    'a.test.json',
    'firmware/lib/zplc_core/tests/fixtures/data.h',
    'firmware/lib/zplc_core/src/core/vm.c',
  ])('does not take %s for a test file', (file) => expect(TEST_FILE.test(file)).toBe(false));
});

describe('checkInventory (VF-022)', () => {
  it('accepts files that a job runs or that are listed as not run', () => {
    expect(checkInventory(files, inventory, workflow)).toEqual([]);
  });

  it('names a test file that no job runs and no rule lists', () => {
    expect(checkInventory([...files, 'scripts/orphan.test.ts'], inventory, workflow)).toEqual(['no CI job runs scripts/orphan.test.ts']);
  });

  it('prefers the rule that runs a file over the rule that lists it as not run', () => {
    const errors = checkInventory(['tools/hil/test_a.py'], inventory, workflow);
    expect(errors).toEqual([
      expect.stringContaining('tools/ci/**/*.test.ts" matches no test file'),
      expect.stringContaining('tools/hil/test_*.py" matches no test file'),
    ]);
  });

  it('rejects a rule whose job is missing or whose job never runs the command', () => {
    const missingJob = { ...inventory, runs: [{ pattern: 'tools/ci/**/*.test.ts', job: 'nope', command: 'x' }] };
    expect(checkInventory(files, missingJob, workflow).join('\n')).toContain('has no job "nope"');
    const missingCommand = {
      ...inventory,
      runs: [{ pattern: 'tools/ci/**/*.test.ts', job: 'typescript', command: 'bun test ./elsewhere' }],
    };
    expect(checkInventory(files, missingCommand, workflow).join('\n')).toContain('no step of job "typescript" runs "bun test ./elsewhere"');
  });

  it('rejects a not-run entry without a requirement ID or a reason', () => {
    const noRequirement = { ...inventory, notRunInCi: [{ pattern: 'tools/hil/test_*.py', requirement: 'later', reason: 'needs a board' }] };
    expect(checkInventory(files, noRequirement, workflow).join('\n')).toContain('requirement');
    const noReason = { ...inventory, notRunInCi: [{ pattern: 'tools/hil/test_*.py', requirement: 'HIL-004', reason: ' ' }] };
    expect(checkInventory(files, noReason, workflow).join('\n')).toContain('reason');
  });

  it('rejects a rule that no test file uses, so the data cannot go stale', () => {
    const stale = {
      ...inventory,
      notRunInCi: [...inventory.notRunInCi, { pattern: 'tools/gone/*.py', requirement: 'HIL-004', reason: 'removed' }],
    };
    expect(checkInventory(files, stale, workflow)).toEqual(['rule "tools/gone/*.py" matches no test file, remove it']);
  });
});

describe('this repository', () => {
  it('has a CI job, or a recorded reason, for every tracked test file', () => {
    const { files: tracked, inventory: committed, workflow: ci } = loadRepository();
    expect(tracked.length).toBeGreaterThan(100);
    expect(checkInventory(tracked, committed, ci)).toEqual([]);
  });
});
