import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkCrossrefs } from './oss-crossrefs';

const dirs: string[] = [];

function write(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'zplc-oss-crossrefs-'));
  dirs.push(dir);
  write(
    dir,
    'AGENTS.md',
    [
      '1. **Read first**: ok.',
      '2. **Follow the constitution**: ok.',
      '3. **Respect the layers**: ok.',
      '4. **Test first**: ok.',
      '5. **Documentation in two languages**: ok.',
      '6. **No new dependency**: ok.',
      '7. **Style**: ok.',
      '8. **Physical operations**: ok.',
    ].join('\n'),
  );
  write(
    dir,
    'specs/001-demo/spec.md',
    ['# Demo', '', '| D-01 | Sample decision |', '', '- **OSS-001** First requirement.', '- **OSS-002** Second requirement.'].join('\n'),
  );
  write(
    dir,
    'docs/docs/guide.md',
    'See `specs/001-demo/spec.md`, decision D-01, requirement OSS-001, and `AGENTS.md` rule 8 for physical operations.\n',
  );
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('OSS-005 cross-reference guard', () => {
  test('passes on the real repository', () => {
    expect(checkCrossrefs()).toEqual([]);
  });

  test('passes on a clean fixture', () => {
    expect(checkCrossrefs(makeFixture())).toEqual([]);
  });

  test('fails when physical operations cite the wrong AGENTS.md guideline number', () => {
    const dir = makeFixture();
    write(dir, 'specs/001-demo/plan.md', 'No flash or force (AGENTS.md guideline 7).\n');
    const findings = checkCrossrefs(dir);
    expect(findings.some((f) => f.rule === 'agents-rule' && f.file === 'specs/001-demo/plan.md')).toBe(true);
  });

  test('fails when dependencies cite AGENTS.md rule 5', () => {
    const dir = makeFixture();
    write(dir, 'specs/001-demo/plan.md', 'Dependency justification (`AGENTS.md` rule 5).\n');
    const findings = checkCrossrefs(dir);
    expect(findings.some((f) => f.rule === 'agents-rule' && f.message.includes('rule 6'))).toBe(true);
  });

  test('fails when an unknown requirement ID is cited', () => {
    const dir = makeFixture();
    write(dir, 'docs/docs/guide.md', 'Covers OSS-999.\n');
    const findings = checkCrossrefs(dir);
    expect(findings.some((f) => f.rule === 'requirement-id' && f.message.includes('OSS-999'))).toBe(true);
  });

  test('fails when an unknown decision ID is cited', () => {
    const dir = makeFixture();
    write(dir, 'docs/docs/guide.md', 'Follows D-99.\n');
    const findings = checkCrossrefs(dir);
    expect(findings.some((f) => f.rule === 'decision-id' && f.message.includes('D-99'))).toBe(true);
  });

  test('fails when a cited repository path does not exist', () => {
    const dir = makeFixture();
    write(dir, 'docs/docs/guide.md', 'See `tools/ci/does-not-exist.ts`.\n');
    const findings = checkCrossrefs(dir);
    expect(findings.some((f) => f.rule === 'repo-path' && f.message.includes('tools/ci/does-not-exist.ts'))).toBe(true);
  });
});
