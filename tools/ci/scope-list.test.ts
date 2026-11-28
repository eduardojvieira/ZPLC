// FRZ-001 & PUB-001: the scope of 2.1.0 is one list in the repository (specs/014-zplc-2-1-release-quality/scope.md):
// five columns, a known state, real commits for what is done, requirement ids that exist,
// and English+Spanish doc pages (or an explicit "none: <reason>") for every row.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { describe, expect, it, spyOn } from 'bun:test';

const ROOT = resolve(import.meta.dir, '../..');
const EN_DOCS = resolve(ROOT, 'docs/docs');
const ES_DOCS = resolve(ROOT, 'docs/i18n/es/docusaurus-plugin-content-docs/current');
const STATES = ['done', 'in progress', 'waiting', 'not started'];
const COLUMNS = ['Item', 'Spec', 'State', 'Blocked by', 'Pages'];

function parseScopeTable(markdown: string): { header: string[]; body: string[][] } {
  const rows = markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
  const [header = [], , ...body] = rows;
  return { header, body };
}

function isInsideDir(baseDir: string, targetPath: string): boolean {
  const rel = relative(baseDir, targetPath);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function checkScopePages(body: string[][], enDocsDir: string, esDocsDir: string): string[] {
  const releaseGate = process.env.ZPLC_RELEASE_GATE === '1';
  const errors: string[] = [];
  const gaps: string[] = [];
  for (const row of body) {
    const item = row[0] ?? '<unnamed row>';
    const pagesCell = row[4];
    if (pagesCell === undefined || pagesCell.length === 0) {
      errors.push(`${item}: missing Pages cell`);
      continue;
    }
    const segments = pagesCell.split(';').map((segment) => segment.trim());
    for (const segment of segments) {
      if (segment.length === 0) {
        errors.push(`${item}: empty page entry in "${pagesCell}"`);
        continue;
      }
      if (/^none\b/i.test(segment)) {
        const reason = segment.match(/^none:\s*(.+)$/i)?.[1]?.trim() ?? '';
        if (reason.length === 0) {
          errors.push(`${item}: "none:" requires a reason`);
        } else if (/\(PUB-001 gap\)/i.test(reason)) {
          gaps.push(`${item}: ${reason}`);
          if (releaseGate) {
            errors.push(`${item}: unresolved PUB-001 gap (${reason})`);
          }
        }
        continue;
      }
      const pages = segment.split(',').map((entry) => entry.trim());
      for (const page of pages) {
        if (page.length === 0) {
          errors.push(`${item}: empty page entry in "${pagesCell}"`);
          continue;
        }
        if (isAbsolute(page) || !/\.mdx?$/i.test(page)) {
          errors.push(`${item}: page "${page}" must be a relative .md or .mdx file inside the docs root`);
          continue;
        }
        const enPath = resolve(enDocsDir, page);
        const esPath = resolve(esDocsDir, page);
        if (!isInsideDir(enDocsDir, enPath) || !isInsideDir(esDocsDir, esPath)) {
          errors.push(`${item}: page "${page}" escapes the docs root`);
          continue;
        }
        if (!existsSync(enPath)) {
          errors.push(`${item}: missing English page docs/docs/${page}`);
        } else if (!statSync(enPath).isFile()) {
          errors.push(`${item}: English page docs/docs/${page} is not a file`);
        }
        if (!existsSync(esPath)) {
          errors.push(`${item}: missing Spanish page docs/i18n/es/docusaurus-plugin-content-docs/current/${page}`);
        } else if (!statSync(esPath).isFile()) {
          errors.push(`${item}: Spanish page docs/i18n/es/docusaurus-plugin-content-docs/current/${page} is not a file`);
        }
      }
    }
  }
  if (gaps.length > 0 && !releaseGate) {
    console.warn(`PUB-001 open doc gaps (${gaps.length}):\n${gaps.map((g) => `  - ${g}`).join('\n')}`);
  }
  return errors;
}

const { header, body } = parseScopeTable(readFileSync(resolve(ROOT, 'specs/014-zplc-2-1-release-quality/scope.md'), 'utf8'));

function indexIds(spec: string): Set<string> {
  const path = resolve(ROOT, `tools/ci/requirement-index-${spec}.json`);
  return new Set((JSON.parse(readFileSync(path, 'utf8')) as { id: string }[]).map((entry) => entry.id));
}

describe('FRZ-001 the scope list of 2.1.0', () => {
  it('has the five columns and at least one row', () => {
    expect(header).toEqual(COLUMNS);
    expect(body.length).toBeGreaterThan(0);
    for (const row of body) expect(row).toHaveLength(5);
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

describe('PUB-001 every scope item names its English and Spanish pages', () => {
  it('verifies every row of scope.md has valid Pages entries in English and Spanish', () => {
    const errors = checkScopePages(body, EN_DOCS, ES_DOCS);
    expect(errors).toEqual([]);
  });

  it('reports every failure mode on a fixture table', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-pages-fixture-'));
    try {
      const enDir = join(root, 'en');
      const esDir = join(root, 'es');
      mkdirSync(join(enDir, 'plant'), { recursive: true });
      mkdirSync(join(esDir, 'plant'), { recursive: true });
      writeFileSync(join(enDir, 'plant/ok.md'), '# ok\n');
      writeFileSync(join(esDir, 'plant/ok.md'), '# ok\n');
      writeFileSync(join(enDir, 'plant/only-en.md'), '# only en\n');
      writeFileSync(join(esDir, 'plant/only-es.md'), '# only es\n');

      const fixture = [
        '| Item | Spec | State | Blocked by | Pages |',
        '|---|---|---|---|---|',
        '| Valid page | none | done | none | plant/ok.md |',
        '| Valid internal | none | done | none | none: internal CI check |',
        '| Missing cell | none | done | none |',
        '| Empty cell | none | done | none | |',
        '| Bare none | none | done | none | none |',
        '| Reasonless none | none | done | none | none:   |',
        '| Missing Spanish | none | done | none | plant/only-en.md |',
        '| Missing English | none | done | none | plant/only-es.md |',
        '| Missing both | none | done | none | plant/missing.md |',
        '| Trailing comma | none | done | none | plant/ok.md, |',
      ].join('\n');

      const parsed = parseScopeTable(fixture);
      const errors = checkScopePages(parsed.body, enDir, esDir);

      expect(errors).toEqual([
        'Missing cell: missing Pages cell',
        'Empty cell: missing Pages cell',
        'Bare none: "none:" requires a reason',
        'Reasonless none: "none:" requires a reason',
        'Missing Spanish: missing Spanish page docs/i18n/es/docusaurus-plugin-content-docs/current/plant/only-en.md',
        'Missing English: missing English page docs/docs/plant/only-es.md',
        'Missing both: missing English page docs/docs/plant/missing.md',
        'Missing both: missing Spanish page docs/i18n/es/docusaurus-plugin-content-docs/current/plant/missing.md',
        'Trailing comma: empty page entry in "plant/ok.md,"',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects directories, absolute paths, parent traversals and non-markdown files (H1)', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-pages-h1-'));
    try {
      const enDir = join(root, 'en');
      const esDir = join(root, 'es');
      mkdirSync(join(enDir, 'plant/dir.md'), { recursive: true });
      mkdirSync(join(esDir, 'plant/dir.md'), { recursive: true });
      writeFileSync(join(enDir, 'plant/ok.mdx'), '# ok\n');
      writeFileSync(join(esDir, 'plant/ok.mdx'), '# ok\n');
      writeFileSync(join(enDir, 'plant/note.txt'), 'not markdown\n');
      writeFileSync(join(esDir, 'plant/note.txt'), 'no es markdown\n');
      writeFileSync(join(root, 'outside.md'), '# outside\n');
      const absMd = join(enDir, 'plant/ok.mdx');

      const fixture = [
        '| Item | Spec | State | Blocked by | Pages |',
        '|---|---|---|---|---|',
        '| Valid mdx | none | done | none | plant/ok.mdx |',
        '| Directory | none | done | none | plant |',
        '| Directory ending in md | none | done | none | plant/dir.md |',
        '| Absolute path | none | done | none | /etc/hostname |',
        `| Absolute md path | none | done | none | ${absMd} |`,
        '| Parent traversal | none | done | none | ../outside.md |',
        '| Non-markdown file | none | done | none | plant/note.txt |',
      ].join('\n');

      const parsed = parseScopeTable(fixture);
      const errors = checkScopePages(parsed.body, enDir, esDir);

      expect(errors).toEqual([
        'Directory: page "plant" must be a relative .md or .mdx file inside the docs root',
        'Directory ending in md: English page docs/docs/plant/dir.md is not a file',
        'Directory ending in md: Spanish page docs/i18n/es/docusaurus-plugin-content-docs/current/plant/dir.md is not a file',
        'Absolute path: page "/etc/hostname" must be a relative .md or .mdx file inside the docs root',
        `Absolute md path: page "${absMd}" must be a relative .md or .mdx file inside the docs root`,
        'Parent traversal: page "../outside.md" escapes the docs root',
        'Non-markdown file: page "plant/note.txt" must be a relative .md or .mdx file inside the docs root',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns on PUB-001 gaps by default and fails when ZPLC_RELEASE_GATE=1 (B4)', () => {
    const root = mkdtempSync(join(tmpdir(), 'scope-pages-b4-'));
    const prevGate = process.env.ZPLC_RELEASE_GATE;
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const enDir = join(root, 'en');
      const esDir = join(root, 'es');
      mkdirSync(join(enDir, 'plant'), { recursive: true });
      mkdirSync(join(esDir, 'plant'), { recursive: true });
      writeFileSync(join(enDir, 'plant/ok.md'), '# ok\n');
      writeFileSync(join(esDir, 'plant/ok.md'), '# ok\n');

      const fixture = [
        '| Item | Spec | State | Blocked by | Pages |',
        '|---|---|---|---|---|',
        '| Open gap | none | done | none | none: page missing (PUB-001 gap) |',
        '| Partial gap | none | in progress | none | plant/ok.md; none: extra page missing (PUB-001 gap) |',
        '| Internal | none | done | none | none: internal CI check |',
      ].join('\n');
      const parsed = parseScopeTable(fixture);

      delete process.env.ZPLC_RELEASE_GATE;
      const devErrors = checkScopePages(parsed.body, enDir, esDir);
      expect(devErrors).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warningText = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(warningText).toContain('Open gap');
      expect(warningText).toContain('Partial gap');

      warnSpy.mockClear();
      process.env.ZPLC_RELEASE_GATE = '1';
      const gateErrors = checkScopePages(parsed.body, enDir, esDir);
      expect(gateErrors).toEqual([
        'Open gap: unresolved PUB-001 gap (page missing (PUB-001 gap))',
        'Partial gap: unresolved PUB-001 gap (extra page missing (PUB-001 gap))',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      if (prevGate === undefined) delete process.env.ZPLC_RELEASE_GATE;
      else process.env.ZPLC_RELEASE_GATE = prevGate;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
