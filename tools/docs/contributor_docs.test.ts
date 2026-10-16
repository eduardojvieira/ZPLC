// The documents of a contributor: one task runner, copy-and-paste commands per layer, labelled fixtures, the constitution
// readable from the contributor pages, a changelog that says what changed for a user, the README as a newcomer reads it and
// the files that agents read (DOC-011, DOC-022, DOC-023, DOC-024, DOC-026, DOC-029, DOC-030). Each test reads the
// repository as a contributor meets it and compares it with what it points at.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { changelogParts, renderReleaseNotes, type RunResults } from '../../scripts/release/release-notes';
import { buildIndex, checkClaims, collectClaims, extractClaims, type AllowEntry } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const scripts = (JSON.parse(text('package.json')) as { scripts: Record<string, string> }).scripts;

/** The recipes of the root task runner that a text runs: `bun run <recipe>`; a command with `--cwd` is a script of a package. */
function recipesIn(content: string): string[] {
  return [...new Set([...content.matchAll(/\bbun run ([A-Za-z][\w:.-]*)/g)].map((match) => match[1]!))];
}

/** The `## Unreleased` section of the changelog: from its heading line to the next version heading. */
function unreleasedSection(changelog: string): string {
  const start = changelog.search(/^## Unreleased$/m);
  const end = changelog.indexOf('\n## ', start + 5);
  return changelog.slice(start, end < 0 ? undefined : end);
}

describe('task runner: one entry point, with a recipe for each step a contributor takes (DOC-023)', () => {
  const contributing = text('CONTRIBUTING.md');

  it('has a recipe for set-up, build, each test layer, simulation, docs and the release rehearsal', () => {
    const required = [
      'setup', 'build:runtime', 'build:compiler', 'build:ide', // set-up and build
      'test:core', 'test:compiler:ci', 'test:ide:ci', 'test:journeys', 'test:firmware', 'contract:check', 'lint', 'typecheck', // the test layers
      'simulate', // simulation
      'check:docs', 'docs:start', // docs
      'release:rehearsal', // the release rehearsal
    ];
    for (const recipe of required) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
  });

  it('names in CONTRIBUTING.md only recipes that exist, and lists each recipe it documents in its table', () => {
    const table = contributing.slice(contributing.indexOf('## One task runner'), contributing.indexOf('## Build'));
    const documented = [...table.matchAll(/^\| `([^`|]+)`/gm)].flatMap((match) => match[1]!.split(',').map((name) => name.trim().replace(/^`|`$/g, '').split(' ')[0]!));
    expect(documented.length).toBeGreaterThanOrEqual(15);
    for (const recipe of documented) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
    for (const recipe of recipesIn(contributing)) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
  });

  it('lets the justfile only forward to recipes of package.json, and the README name only recipes that exist', () => {
    for (const recipe of recipesIn(text('justfile'))) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
    for (const recipe of recipesIn(text('README.md'))) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
    for (const recipe of recipesIn(text('docs/docs/contributing/index.md'))) expect({ recipe, defined: recipe in scripts }).toEqual({ recipe, defined: true });
  });
});

describe('CONTRIBUTING.md: copy-and-paste commands per layer, and the files a contributor expects (DOC-024)', () => {
  const contributing = text('CONTRIBUTING.md');

  it('gives set-up, the native runtime build and a command for each test layer, each with an expected duration', () => {
    const layers = contributing.slice(contributing.indexOf('## Test, layer by layer'), contributing.indexOf('Notes that save time'));
    const rows = layers.split('\n').filter((line) => /^\| (?!Layer|---)/.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) {
      const cells = row.split('|').map((cell) => cell.trim());
      expect({ row: cells[1], command: /`bun run [^`]+`/.test(cells[2]!) }).toEqual({ row: cells[1], command: true });
      expect({ row: cells[1], time: /\b(?:about|to)\b.*\b(?:s|min)\b/.test(cells[3]!) }).toEqual({ row: cells[1], time: true });
    }
    expect(contributing).toContain('cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build');
    expect(contributing).toContain('bun run setup');
  });

  it('has the code of conduct, the bug and board report templates, a pull request template and a roadmap with done, next and later', () => {
    for (const file of ['CODE_OF_CONDUCT.md', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/board_report.yml', '.github/PULL_REQUEST_TEMPLATE.md']) {
      expect({ file, exists: existsSync(join(ROOT, file)) }).toEqual({ file, exists: true });
    }
    const roadmap = contributing.slice(contributing.indexOf('## Roadmap'));
    for (const word of ['**Done:**', '**Next:**', '**Later:**']) expect(roadmap).toContain(word);
  });

  it('has a first section that sends a contributor to the set-up and not to the agent file', () => {
    const head = contributing.slice(0, 1200);
    expect(head).not.toMatch(/AGENTS\.md/);
    expect(text('AGENTS.md').slice(0, 600)).toContain('CONTRIBUTING.md');
  });
});

describe('examples: the VM fixtures are labelled and the PLC projects are easy to find (DOC-026)', () => {
  it('says what the root folder holds, lists every fixture and points to the example projects', () => {
    const readme = text('examples/README.md');
    expect(readme.split('\n')[0]).toMatch(/fixtures/i);
    expect(readme).toMatch(/not\*\* PLC example programs/);
    expect(readme).toContain('packages/zplc-ide/projects/');
    const fixtures = [...new Set(readdirSync(join(ROOT, 'examples')).filter((name) => name.endsWith('.asm')).map((name) => name.replace(/\.asm$/, '')))];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) expect({ fixture, listed: readme.includes(`\`${fixture}\``) }).toEqual({ fixture, listed: true });
  });

  it('is found from the root README and from the contributor guide', () => {
    for (const file of ['README.md', 'CONTRIBUTING.md', 'AGENTS.md']) {
      expect({ file, linked: text(file).includes('packages/zplc-ide/projects/') }).toEqual({ file, linked: true });
    }
  });
});

describe('principles: the constitution is readable from the contributor pages (DOC-029)', () => {
  it('has one section for each rule of the constitution, in English and in Spanish, linked from the guide', () => {
    const rules = [...text('.specify/memory/constitution.md').matchAll(/^(\d+)\. /gm)].length;
    expect(rules).toBeGreaterThanOrEqual(9);
    for (const file of ['docs/docs/contributing/principles.md', 'docs/i18n/es/docusaurus-plugin-content-docs/current/contributing/principles.md']) {
      const sections = [...text(file).matchAll(/^### (\d+)\. /gm)].length;
      expect({ file, sections }).toEqual({ file, sections: rules });
    }
    expect(text('CONTRIBUTING.md')).toContain('docs/docs/contributing/principles.md');
    expect(text('docs/docs/contributing/index.md')).toContain('./principles.md');
  });
});

describe('changelog: what changed for a user, what breaks, how to migrate and what is limited (DOC-030)', () => {
  const changelog = text('CHANGELOG.md');
  const results = (): RunResults => JSON.parse(text('scripts/release/fixtures/run-results.json')) as RunResults;

  it('names its parts in its header and gives the unreleased section all four, each with content or "None."', () => {
    for (const part of ['What changed for you', 'Breaking changes', 'Migration', 'Known limits', 'Details for contributors']) {
      expect({ part, named: changelog.slice(0, 2400).includes(part) }).toEqual({ part, named: true });
    }
    const unreleased = unreleasedSection(changelog);
    const headings = [...unreleased.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
    expect(headings.slice(0, 5)).toEqual(['What changed for you', 'Breaking changes', 'Migration', 'Known limits', 'Details for contributors']);
    const read = changelogParts(changelog, 'Unreleased');
    expect(read.structured).toBe(true);
    for (const part of ['changes', 'breaking', 'migration', 'limits'] as const) expect({ part, items: read[part].length > 0 }).toEqual({ part, items: true });
  });

  it('puts each version cut after rc.3 in the same shape, so that its release notes list the four parts', () => {
    const headings = [...changelog.matchAll(/^## (\d+\.\d+\.\d+(?:-[\w.]+)?) - \d{4}-\d{2}-\d{2}$/gm)].map((match) => match[1]!);
    const unstructured = headings.filter((version) => /^2\.0\.0-rc\.(?:[4-9]|\d{2,})$|^2\.0\.[1-9]|^2\.[1-9]|^[3-9]\./.test(version) && !changelogParts(changelog, version).structured);
    expect(unstructured).toEqual([]);
  });

  it('prints the breaking changes, the migration and the limits in the notes of a release', () => {
    const unreleased = unreleasedSection(changelog);
    const parts = changelogParts(unreleased.replace('## Unreleased', '## 2.0.0-rc.4 - 2026-10-20'), '2.0.0-rc.4');
    const notes = renderReleaseNotes({ ...results(), changes: parts.changes, breaking: parts.breaking, migration: parts.migration, knownIssues: parts.limits });
    expect(notes).toContain('### What changed');
    expect(notes).toContain('### Breaking changes');
    expect(notes).toContain('### Migration');
    expect(notes).toContain('Rebuild every program and reflash every board');
    expect(notes).toContain('### Known issues');
    expect(notes).not.toContain('Details for contributors');
  });
});

describe('README: what ZPLC is, what it does today, what it runs on and how to try it, on the first screen (DOC-011)', () => {
  const readme = text('README.md');

  it('says in its first lines what ZPLC is, gives one status line, a download link and the licence', () => {
    const firstScreen = readme.split('\n').slice(0, 20).join('\n');
    expect(firstScreen).toContain('IEC 61131-3 PLC runtime and desktop IDE');
    expect(firstScreen.match(/^> \*\*Status:\*\*/gm)?.length).toBe(1);
    expect(firstScreen).toContain('/releases');
    expect(firstScreen).toContain('MIT');
  });

  it('has what a user can do today, what it runs on, how to try it and the comparison, in that order', () => {
    const positions = ['## What you can do today', '## What it runs on', '## Try it', '## How it compares'].map((heading) => readme.indexOf(heading));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('compares ZPLC with OpenPLC, Beremiz, CODESYS and the Arduino PLC IDE, with a date and a source in each row', () => {
    const section = readme.slice(readme.indexOf('## How it compares'), readme.indexOf('## Documentation'));
    expect(section).toMatch(/Checked on \d{4}-\d{2}-\d{2}/);
    for (const name of ['OpenPLC', 'Beremiz', 'CODESYS', 'Arduino PLC IDE']) {
      const row = section.split('\n').find((line) => line.startsWith('|') && line.includes(name));
      expect({ name, sourced: row?.includes('](http') ?? false }).toEqual({ name, sourced: true });
    }
  });

  it('links to pages of the repository that exist', () => {
    const links = [...readme.matchAll(/\]\(((?:docs|packages|firmware)\/[^)#\s]+|LICENSE|west\.yml)(?:#[^)]*)?\)/g)].map((match) => match[1]!);
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect({ link, exists: existsSync(join(ROOT, link)) }).toEqual({ link, exists: true });
  });
});

describe('agent files: the project skill and AGENTS.md are current, and the contributor guide comes first (DOC-022)', () => {
  it('tracks only the project skill under .agents', () => {
    const tracked = Bun.spawnSync(['git', 'ls-files', '.agents'], { cwd: ROOT, stdout: 'pipe' }).stdout.toString().split('\n').filter(Boolean);
    expect(tracked).toContain('.agents/skills/zplc-plc-programmer/SKILL.md');
    expect(tracked.filter((file) => !file.startsWith('.agents/skills/zplc-plc-programmer/'))).toEqual([]);
  });

  it('holds the claims of AGENTS.md, QUICKSTART_AGENTS.md and the skill to the check that the pages pass', () => {
    const pages = new Set(collectClaims(ROOT).map((claim) => claim.page));
    for (const page of ['AGENTS.md', 'QUICKSTART_AGENTS.md', '.agents/skills/zplc-plc-programmer/SKILL.md']) expect({ page, checked: pages.has(page) }).toEqual({ page, checked: true });
    const invented = extractClaims('.agents/skills/zplc-plc-programmer/SKILL.md', 'Run `bun run no-such-recipe-exists` before the build, and read `tools/no/such/file.py`.');
    expect(invented.length).toBeGreaterThan(0);
    expect(checkClaims(invented, buildIndex(), []).findings.length).toBe(invented.length);
  });

  it('has AGENTS.md point to CONTRIBUTING.md, and CONTRIBUTING.md not point back', () => {
    expect(text('AGENTS.md')).toContain('(CONTRIBUTING.md)');
    expect(text('CONTRIBUTING.md')).not.toMatch(/AGENTS\.md|QUICKSTART_AGENTS\.md/);
  });
});

describe('internal process output is off the public surface (DOC-021)', () => {
  it('has an architecture overview whose paths, commands and symbols exist, and that is signed by no tool', () => {
    const claims = collectClaims(ROOT).filter((claim) => claim.page === 'ARCHITECTURE.md');
    expect(claims.length).toBeGreaterThan(10);
    const allow = JSON.parse(text('docs/doc-claims-allowlist.json')) as AllowEntry[];
    expect(checkClaims(claims, buildIndex(), allow).findings).toEqual([]);
    expect(text('ARCHITECTURE.md')).not.toMatch(/\b(generated|written|signed|authored) by (an? )?(AI|Claude|Gemini|ChatGPT|Copilot|LLM)\b|\ba lie\b/i);
  });

  it('files the documentation tracker and the source-of-truth map under Project, with the contributor pages, and not under Reference', async () => {
    const { default: sidebars } = await import(join(ROOT, 'docs/sidebars.js')) as { default: { docsSidebar: Array<{ label: string; items: unknown[] }> } };
    const flat = (items: unknown[]): string[] => items.flatMap((item) => (typeof item === 'string' ? [item] : flat((item as { items: unknown[] }).items)));
    const category = (label: string) => flat(sidebars.docsSidebar.find((entry) => entry.label === label)!.items);
    for (const page of ['reference/source-of-truth', 'reference/v1-5-canonical-docs-manifest']) {
      expect({ page, project: category('Project').includes(page), reference: category('Reference').includes(page) }).toEqual({ page, project: true, reference: false });
    }
    expect(category('Project')).toContain('contributing/index');
  });

  it('names a team or a role as the owner of every gate of the release record, never the tool that runs the check', () => {
    const rows = text('specs/008-release-foundation/artifacts/release-evidence-matrix.md').split('\n').filter((line) => /^\| REL-\d+ /.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) {
      const cells = row.split('|').map((cell) => cell.trim());
      const [gate, owner] = [cells[1]!, cells[5]!];
      expect({ gate, owner: owner.length > 0 && !/^(AI|Claude|Gemini|ChatGPT|Copilot|LLM|bot|agent)$/i.test(owner) }).toEqual({ gate, owner: true });
    }
  });
});
