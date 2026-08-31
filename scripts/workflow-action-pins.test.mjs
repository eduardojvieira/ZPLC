import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/deploy-docs.yml',
];

const approvedActions = new Map([
  ['actions/checkout', ['08eba0b27e820071cde6df949e0beb9ba4906955', 'v4.3.0']],
  ['actions/setup-node', ['49933ea5288caeca8642d1e84afbd3f7d6820020', 'v4.4.0']],
  ['actions/setup-python', ['a26af69be951a213d495a4c3e4e4022e16d87065', 'v5.6.0']],
  ['oven-sh/setup-bun', ['f4d14e03ff726c06358e5557344e1da148b56cf7', 'v1.2.2']],
  ['actions/upload-artifact', ['ea165f8d65b6e75b540449e92b4886f43607fa02', 'v4.6.2']],
  ['actions/download-artifact', ['d3f86a106a0bac45b974a628896c90dbdf5c8093', 'v4.3.0']],
  ['anchore/sbom-action', ['e22c389904149dbc22b58101806040fa8d37a610', 'v0.24.0']],
  ['actions/attest', ['508db95dd578ae2727ebd6217d5ba78e4fbda05d', 'v4.2.1']],
  ['softprops/action-gh-release', ['3d0d9888cb7fd7b750713d6e236d1fcb99157228', 'v3.0.2']],
  ['actions/upload-pages-artifact', ['56afc609e74202658d3ffba0e8f6dda462b719fa', 'v3.0.1']],
  ['actions/deploy-pages', ['d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e', 'v4.0.5']],
]);

function validateUsesLines(workflowPath, usesLines) {
  assert.ok(usesLines.length > 0, `${workflowPath} must contain at least one uses step`);
  const foundActions = new Set();
  for (const line of usesLines) {
    const match = line.match(/^\s*uses:\s*([^@\s#]+)@([a-f0-9]{40})\s+#\s+(v\d+\.\d+\.\d+)\s*$/);
    assert.ok(match, `${workflowPath} has an invalid or unpinned uses step: ${line.trim()}`);
    const [, repository, sha, version] = match;
    const approved = approvedActions.get(repository);
    assert.ok(approved, `${workflowPath} has an unknown action: ${repository}`);
    assert.deepEqual([sha, version], approved, `${workflowPath} has an unapproved pin: ${repository}`);
    foundActions.add(repository);
  }
  return foundActions;
}

function validateFrozenLockfileGuards(workflowPath, workflow, expectedInstallCount) {
  const lines = workflow.split('\n');
  const installLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /bun install --frozen-lockfile\s*$/.test(line));

  assert.equal(
    installLines.length,
    expectedInstallCount,
    `${workflowPath} must contain exactly ${expectedInstallCount} frozen Bun installs`,
  );

  for (const { line, index } of installLines) {
    const installIndent = line.match(/^\s*/)?.[0].length ?? 0;
    assert.match(
      lines[index - 1] ?? '',
      /^\s*test -f bun\.lock\s*$/,
      `${workflowPath} must check out bun.lock immediately before frozen Bun install`,
    );
    assert.ok(
      (lines[index - 1]?.match(/^\s*/)?.[0].length ?? 0) === installIndent,
      `${workflowPath} lockfile guard must be in the same run block as frozen Bun install`,
    );
    const runLineIndex = lines.slice(0, index).findLastIndex((candidate) => /^\s*run:\s*\|\s*$/.test(candidate));
    assert.notEqual(runLineIndex, -1, `${workflowPath} frozen Bun install must use a block run step`);
    const runIndent = lines[runLineIndex].match(/^\s*/)?.[0].length ?? 0;
    assert.ok(
      installIndent > runIndent && lines.slice(runLineIndex + 1, index + 1).every((candidate) => !candidate.trim() || (candidate.match(/^\s*/)?.[0].length ?? 0) > runIndent),
      `${workflowPath} lockfile guard and frozen Bun install must remain in the same run block`,
    );
  }
}

test('pins every third-party action in CI, release, and docs workflows to its approved commit and version', async () => {
  const foundActions = new Set();
  for (const workflowPath of workflows) {
    const workflow = await readFile(new URL(`../${workflowPath}`, import.meta.url), 'utf8');
    const usesLines = workflow.split('\n').filter((line) => /^\s*uses:/.test(line));
    for (const action of validateUsesLines(workflowPath, usesLines)) foundActions.add(action);
  }
  for (const expectedAction of approvedActions.keys()) {
    assert.ok(foundActions.has(expectedAction), `expected action is missing: ${expectedAction}`);
  }
});

test('rejects an altered SHA or version comment', () => {
  const line = '        uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0';
  assert.throws(() => validateUsesLines('fixture.yml', [line.replace('08eba0b27e820071cde6df949e0beb9ba4906955', '0'.repeat(40))]));
  assert.throws(() => validateUsesLines('fixture.yml', [line.replace('v4.3.0', 'v4.3.1')]));
  assert.throws(() => validateUsesLines('fixture.yml', [line.replace(' # v4.3.0', '')]));
});

test('requires every frozen Bun install to guard the checked-out root lockfile', async () => {
  const expectedInstallCounts = new Map([
    ['.github/workflows/ci.yml', 2],
    ['.github/workflows/release.yml', 3],
    ['.github/workflows/deploy-docs.yml', 1],
  ]);

  for (const [workflowPath, expectedInstallCount] of expectedInstallCounts) {
    const workflow = await readFile(new URL(`../${workflowPath}`, import.meta.url), 'utf8');
    validateFrozenLockfileGuards(workflowPath, workflow, expectedInstallCount);
  }
});

test('rejects a frozen Bun install without its immediate lockfile guard', () => {
  const workflow = [
    '      - name: Install dependencies',
    '        run: |',
    '          bun install --frozen-lockfile',
  ].join('\n');
  assert.throws(() => validateFrozenLockfileGuards('fixture.yml', workflow, 1));
});
