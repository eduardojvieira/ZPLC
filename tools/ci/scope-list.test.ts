// FRZ-001: the scope of 2.1.0 is one list in the repository (specs/014-zplc-2-1-release-quality/scope.md):
// four columns, a known state, real commits for what is done, and requirement ids that exist.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

const ROOT = resolve(import.meta.dir, '../..');
const STATES = ['done', 'in progress', 'waiting', 'not started'];
const COLUMNS = ['Item', 'Spec', 'State', 'Blocked by'];

const rows = readFileSync(resolve(ROOT, 'specs/014-zplc-2-1-release-quality/scope.md'), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .map((line) =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim()),
  );
const [header, , ...body] = rows;

function indexIds(spec: string): Set<string> {
  const path = resolve(ROOT, `tools/ci/requirement-index-${spec}.json`);
  return new Set((JSON.parse(readFileSync(path, 'utf8')) as { id: string }[]).map((entry) => entry.id));
}

describe('FRZ-001 the scope list of 2.1.0', () => {
  it('has the four columns and at least one row', () => {
    expect(header).toEqual(COLUMNS);
    expect(body.length).toBeGreaterThan(0);
    for (const row of body) expect(row).toHaveLength(4);
  });

  it('gives every row a known state', () => {
    for (const row of body) expect(STATES).toContain(row[2].replace(/ \(.*\)$/, ''));
  });

  it('names an existing commit for every done row', () => {
    for (const row of body.filter((r) => r[2].startsWith('done'))) {
      const commits = row[2].match(/\(([^)]*)\)/)?.[1].split(/,\s*/) ?? [];
      expect(commits.length, row[0]).toBeGreaterThan(0);
      for (const commit of commits) {
        const result = Bun.spawnSync(['git', 'cat-file', '-e', `${commit}^{commit}`], { cwd: ROOT });
        expect(result.exitCode, `${row[0]}: ${commit}`).toBe(0);
      }
    }
  });

  it('uses only requirement ids that its spec defines', () => {
    for (const row of body) {
      for (const group of row[1].split(';').map((g) => g.trim())) {
        const match = group.match(/^(012|013|014) (.+)$/);
        if (!match) continue; // no requirement id (plan tasks, release work)
        const ids = indexIds(match[1]);
        for (const token of match[2].split(/,\s*/)) {
          const range = token.match(/^([A-Z]{3})-(\d{3})\.\.(\d{3})$/);
          const wanted = range
            ? Array.from({ length: +range[3] - +range[2] + 1 }, (_, i) => `${range[1]}-${String(+range[2] + i).padStart(3, '0')}`)
            : /^[A-Z]{3}-\d{3}$/.test(token)
              ? [token]
              : []; // plan task ids such as C2 or G1 are not checked
          for (const id of wanted) expect(ids.has(id), `${row[0]}: ${id} in ${match[1]}`).toBe(true);
        }
      }
    }
  });
});
