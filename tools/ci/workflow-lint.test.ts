// The workflow lint over small workflows written here, never over .github/workflows: the lint reads those in CI.
import { describe, expect, it } from 'bun:test';

import { SHARDS } from './test-shards';
import { lintWorkflows } from './workflow-lint';

const MATRIX = `[${Array.from({ length: SHARDS }, (_, index) => index + 1).join(', ')}]`;
const shardJob = (id: string) => `  ${id}:
    runs-on: ubuntu-latest
    timeout-minutes: 50
    strategy:
      fail-fast: false
      matrix:
        shard: ${MATRIX}
    steps:
      - name: Select the test files of the shard
        run: bun tools/ci/test-shards.ts env "\${{ matrix.shard }}" | tee -a "\${GITHUB_ENV}"
      - name: Test the IDE
        run: |
          read -ra files <<< "\${ZPLC_IDE_SHARD_FILES:?}"
          bun run test:ide -- "\${files[@]}"
`;

const GOOD: Record<string, string> = {
  'ci.yml': `on: push
jobs:
${shardJob('ide-tests')}  format:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: bun run format:check
`,
  'nightly-quality.yml': `on: push
jobs:
${shardJob('desktop-ide-tests')}`,
  'release.yml': `on: push
jobs:
  verify:
    uses: ./.github/workflows/ci.yml
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - run: make
`,
};
const LONGEST = 30;

/** The problems of the good workflows once `from` is replaced by `to` in one of them. */
function lintWith(file: string, from: string, to: string): string[] {
  const text = GOOD[file]!;
  if (!text.includes(from)) throw new Error(`the fixture ${file} has no "${from}"`);
  return lintWorkflows({ ...GOOD, [file]: text.replace(from, to) }, LONGEST);
}

describe('the workflow lint', () => {
  it('passes workflows whose jobs have a time limit and whose shard jobs follow the plan; a reusable-workflow call needs none', () => {
    expect(lintWorkflows(GOOD, LONGEST)).toEqual([]);
  });

  it.each([
    ['release.yml', '    timeout-minutes: 90\n', '', 'release.yml job build'],
    ['ci.yml', 'timeout-minutes: 15', 'timeout-minutes: 7.5', 'ci.yml job format'],
    ['ci.yml', 'timeout-minutes: 15', "timeout-minutes: '15'", 'ci.yml job format'],
  ])('names the job of %s whose time limit is not a whole number of minutes', (file, from, to, job) => {
    expect(lintWith(file, from, to)).toEqual([`${job}: timeout-minutes must be a whole number of minutes above 0`]);
  });

  it('names a shard job whose matrix is not every shard of the plan', () => {
    expect(lintWith('nightly-quality.yml', `shard: ${MATRIX}`, 'shard: [1, 2]')).toEqual([
      `nightly-quality.yml job desktop-ide-tests: the shard matrix must be 1 to ${SHARDS}, the SHARDS of tools/ci/test-shards.ts`,
    ]);
  });

  it('names a shard job where one failing shard cancels the others', () => {
    expect(lintWith('ci.yml', 'fail-fast: false', 'fail-fast: true')).toEqual([
      'ci.yml job ide-tests: fail-fast must be false, so that one failing shard stops no other',
    ]);
  });

  it('names a shard job whose selection step does not write the shard into $GITHUB_ENV', () => {
    expect(lintWith('ci.yml', ' | tee -a "${GITHUB_ENV}"', '')).toEqual([
      'ci.yml job ide-tests: no step pipes bun tools/ci/test-shards.ts env "${{ matrix.shard }}" into tee -a "${GITHUB_ENV}"',
    ]);
  });

  it('names a shard job whose tests do not run the files of the shard', () => {
    expect(lintWith('nightly-quality.yml', '${ZPLC_IDE_SHARD_FILES:?}', '${ZPLC_IDE_FILES:?}')).toEqual([
      'nightly-quality.yml job desktop-ide-tests: no step reads the files of the shard from "${ZPLC_IDE_SHARD_FILES:?}"',
    ]);
  });

  it('names a shard job whose time limit is not above the longest shard of the plan', () => {
    expect(lintWith('ci.yml', 'timeout-minutes: 50', `timeout-minutes: ${LONGEST}`)).toEqual([
      `ci.yml job ide-tests: timeout-minutes ${LONGEST} must be above ${LONGEST.toFixed(1)}, the longest shard of tools/ci/test-shards.ts`,
    ]);
  });

  it('names a shard job that is missing', () => {
    expect(lintWith('nightly-quality.yml', 'desktop-ide-tests:', 'desktop-tests:')).toEqual([
      'nightly-quality.yml job desktop-ide-tests: missing; it runs the IDE suite in the shards of tools/ci/test-shards.ts',
    ]);
  });

  const only = 'which only bun tools/ci/test-shards.ts env may set, through $GITHUB_ENV';
  it.each([
    [
      'release.yml',
      'on: push\njobs:',
      'on: push\nenv:\n  ZPLC_LESSON_PART: 1/2\njobs:',
      `release.yml: the workflow env sets ZPLC_LESSON_PART, ${only}`,
    ],
    [
      'ci.yml',
      '    timeout-minutes: 15\n',
      '    timeout-minutes: 15\n    env:\n      ZPLC_PARITY_PART: 1/3\n',
      `ci.yml job format: env sets ZPLC_PARITY_PART, ${only}`,
    ],
    [
      'nightly-quality.yml',
      '      - name: Test the IDE\n',
      '      - name: Test the IDE\n        env:\n          ZPLC_IDE_SHARD_FILES: ./a.test.ts\n',
      `nightly-quality.yml job desktop-ide-tests step "Test the IDE": env sets ZPLC_IDE_SHARD_FILES, ${only}`,
    ],
  ])('names an env of %s that sets a variable of the shard plan', (file, from, to, problem) => {
    expect(lintWith(file, from, to)).toEqual([problem]);
  });
});
