// The reading page of a lesson package (LRN-040, LRN-042): the optional files, their CI checks, and what the index bundles.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import { buildIndex, loadCourse, loadLessonPackages, LESSONS_DIRECTORY } from './lessonPackageFiles';
import { MAX_READING_IMAGE_BYTES } from './lessonPackage';

const FIXTURE = join(import.meta.dir, 'fixtures', 'reading', 'valid');
const LESSON = 'first-blink-simulation';
const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

/** A lessons directory holding only the lesson, with the fixture reading page when `withReading`; `edit` gets the lesson directory. */
function lessons(edit: (directory: string) => void = () => {}, withReading = true): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-reading-'));
  temporary.push(root);
  const directory = join(root, LESSON);
  cpSync(join(LESSONS_DIRECTORY, LESSON), directory, { recursive: true });
  if (withReading) cpSync(FIXTURE, directory, { recursive: true });
  edit(directory);
  return root;
}
const edit = (directory: string, file: string, change: (text: string) => string): void =>
  writeFileSync(join(directory, file), change(readFileSync(join(directory, file), 'utf8')));
const problemsOf = (root: string): string[] => loadLessonPackages(root).problems.map((problem) => problem.replace(`${root}/`, ''));
const course = loadCourse().course!;

describe('a lesson package with a reading page (LRN-042)', () => {
  it('loads with the two pages, the files under reading/ and the images', () => {
    const { packages, problems } = loadLessonPackages(lessons());
    expect(problems).toEqual([]);
    const reading = packages[0]!.reading!;
    expect(reading.en).toContain('## A first page');
    expect(reading.es).toContain('## Una primera página');
    expect(Object.keys(reading.files).sort()).toEqual(['reading/fig.ld.json', 'reading/try.ld.json']);
    expect(Object.keys(reading.images).sort()).toEqual(['images/dot.png', 'images/panel.svg']);
  });

  it('is optional: a lesson without reading files has no reading and an index entry without a reading key', () => {
    const { packages, problems } = loadLessonPackages(lessons(() => {}, false));
    expect(problems).toEqual([]);
    expect(packages[0]!.reading).toBeNull();
    const entry = buildIndex(packages, course).index.lessons[0]!;
    expect('reading' in entry).toBe(false);
  });

  it('needs both languages or neither', () => {
    const only = lessons((directory) => rmSync(join(directory, 'reading.es.md')));
    expect(problemsOf(only)).toEqual([`${LESSON}: reading.en.md and reading.es.md must both exist or neither`]);
    const files = lessons((directory) => {
      rmSync(join(directory, 'reading.en.md'));
      rmSync(join(directory, 'reading.es.md'));
    });
    expect(problemsOf(files)).toEqual([`${LESSON}: the reading/ and images/ files belong to a lesson with a reading page`]);
  });

  it('refuses a page that has a parse error, naming the file and the line', () => {
    const html = lessons((directory) => edit(directory, 'reading.es.md', (text) => `${text}\nUna <b>palabra</b>.\n`));
    const lineCount = readFileSync(join(html, LESSON, 'reading.es.md'), 'utf8').split('\n').length - 1;
    expect(problemsOf(html)).toEqual([
      `${LESSON}/reading.es.md:${lineCount}: raw HTML is not allowed`,
      `${LESSON}/reading.es.md:${lineCount}: raw HTML is not allowed`,
    ]);
    const link = lessons((directory) => edit(directory, 'reading.en.md', (text) => text.replace('## A first page', '# A first page')));
    expect(problemsOf(link)).toEqual([`${LESSON}/reading.en.md:1: level-1 headings are not allowed: the title comes from the lesson text`]);
  });

  it('refuses English and Spanish pages that do not have the same shape', () => {
    const shape = `${LESSON}: the English and Spanish reading pages do not have the same structure`;
    expect(problemsOf(lessons((directory) => edit(directory, 'reading.es.md', (text) => text.replace('  - anidado\n', ''))))).toEqual([
      shape,
    ]);
    expect(problemsOf(lessons((directory) => edit(directory, 'reading.es.md', (text) => text.replace('rung: 1', 'rung: 2'))))).toEqual([
      shape,
    ]);
    // Text fields differ on purpose and are not a difference of shape.
    expect(problemsOf(lessons())).toEqual([]);
  });

  it('refuses English and Spanish pages that quote different facts', () => {
    const swapped = lessons((directory) => edit(directory, 'reading.es.md', (text) => text.replace('{{assertions}}', 'diez')));
    expect(problemsOf(swapped)).toEqual([`${LESSON}: the English and Spanish reading pages do not quote the same facts`]);
  });

  it('refuses a live block or an image whose file is not in the package', () => {
    expect(problemsOf(lessons((directory) => rmSync(join(directory, 'reading', 'fig.ld.json'))))).toEqual([
      `${LESSON}/reading.en.md: "reading/fig.ld.json" is not in the package`,
      `${LESSON}/reading.es.md: "reading/fig.ld.json" is not in the package`,
    ]);
    expect(problemsOf(lessons((directory) => rmSync(join(directory, 'images', 'panel.svg'))))).toEqual([
      `${LESSON}/reading.en.md: "images/panel.svg" is not in the package`,
      `${LESSON}/reading.es.md: "images/panel.svg" is not in the package`,
    ]);
  });

  it('refuses an image over 300 KB or a PNG without the PNG signature', () => {
    const big = lessons((directory) =>
      edit(directory, 'images/panel.svg', (text) => `${text}<!--${'x'.repeat(MAX_READING_IMAGE_BYTES)}-->`),
    );
    expect(problemsOf(big)).toEqual([`${LESSON}/images/panel.svg: is over the 300 KB limit`]);
    const notPng = lessons((directory) => writeFileSync(join(directory, 'images', 'dot.png'), 'not a png'));
    expect(problemsOf(notPng)).toEqual([`${LESSON}/images/dot.png: is not a PNG file`]);
  });

  it('refuses an SVG with a script, a foreignObject, an event attribute or an href that leaves the file', () => {
    const svg = (inner: string) =>
      lessons((directory) => edit(directory, 'images/panel.svg', (text) => text.replace('<use href="#a"/>', inner)));
    expect(problemsOf(svg('<script>alert(1)</script>'))).toEqual([`${LESSON}/images/panel.svg: contains <script`]);
    expect(problemsOf(svg('<foreignObject><p/></foreignObject>'))).toEqual([`${LESSON}/images/panel.svg: contains <foreignObject`]);
    expect(problemsOf(svg('<rect onload="x()" width="1" height="1"/>'))).toEqual([
      `${LESSON}/images/panel.svg: has the event attribute onload=`,
    ]);
    expect(problemsOf(svg('<use href="https://example.com/a.svg#b"/>'))).toEqual([
      `${LESSON}/images/panel.svg: has an href that leaves the file ("https://example.com/a.svg#b")`,
    ]);
    expect(problemsOf(svg('<use xlink:href="data:image/svg+xml,x"/>'))).toEqual([
      `${LESSON}/images/panel.svg: has an href that leaves the file ("data:image/svg+xml,x")`,
    ]);
    // An in-document reference is fine, and so is the fixture itself.
    expect(problemsOf(svg('<use href="#b"/>'))).toEqual([]);
  });

  it('refuses an ld-figure file that does not load as a Ladder model', () => {
    const broken = lessons((directory) => writeFileSync(join(directory, 'reading', 'fig.ld.json'), '{"name":"x"}'));
    const [problem, ...rest] = problemsOf(broken);
    expect(rest).toEqual([]);
    expect(problem).toStartWith(`${LESSON}: reading/fig.ld.json is not a Ladder file`);
  });

  it('refuses an ld-try program that does not compile with compileProject', () => {
    const broken = lessons((directory) =>
      edit(directory, 'reading/try.ld.json', (text) => text.replace('"variable": "Ack"', '"variable": "Nope"')),
    );
    const [problem, ...rest] = problemsOf(broken);
    expect(rest).toEqual([]);
    expect(problem).toStartWith(`${LESSON}: reading/try.ld.json does not compile`);
    expect(problem).toContain("'Nope'");
  });

  it('applies the quoted-fact rules to prose: expansion, the unmarked-time rule, and the files it cites', () => {
    const quoted = (change: (text: string) => string) => problemsOf(lessons((directory) => edit(directory, 'reading.en.md', change)));
    expect(quoted((text) => text.replace('{{t:500}}', '{{t:15}}'))).toEqual([
      `${LESSON}/reading.en.md: time 15 ms is not on the timeline of scenario ${scenarioId()} (tick 10 ms, duration 1600 ms)`,
      `${LESSON}: the English and Spanish reading pages do not quote the same facts`,
    ]);
    expect(quoted((text) => text.replace('{{assertions}}', '{{nope}}'))).toEqual([
      `${LESSON}/reading.en.md: unresolved markup in "The scenario has {{nope}} assertions and the lamp changes at {{t:500}} ms. Open src/FirstBlink.st first."`,
      `${LESSON}: the English and Spanish reading pages do not quote the same facts`,
    ]);
    expect(quoted((text) => text.replace('at {{t:500}} ms', 'at 500 ms'))).toEqual([
      `${LESSON}/reading.en.md: quoted time "500 ms" is not marked with {{t:N}}`,
      `${LESSON}: the English and Spanish reading pages do not quote the same facts`,
    ]);
    expect(quoted((text) => text.replace('Open src/FirstBlink.st first.', 'Open src/Missing.st first.'))).toEqual([
      `${LESSON}/reading.en.md: cites src/Missing.st, which the starter does not have`,
    ]);
    // Inline code and fenced blocks are not prose: neither a bare time nor a path is checked there.
    expect(quoted((text) => `${text}\nThe name \`src/Missing.st at 77 ms\`.\n\n\`\`\`st\n(* 99 ms in src/Missing.st *)\n\`\`\`\n`)).toEqual(
      [`${LESSON}: the English and Spanish reading pages do not have the same structure`],
    );
  });

  it('bundles the expanded pages, the files a live block references and the images the pages use', () => {
    const root = lessons((directory) => writeFileSync(join(directory, 'reading', 'unused.ld.json'), '{}'));
    const { packages, problems } = loadLessonPackages(root);
    expect(problems).toEqual([]);
    const built = buildIndex(packages, course);
    expect(built.problems).toEqual([]);
    const reading = built.index.lessons[0]!.reading!;
    expect(reading.en).toContain('The scenario has 10 assertions and the lamp changes at 500 ms. Open src/FirstBlink.st first.');
    expect(reading.es).toContain('los 500 ms');
    expect(reading.en).not.toContain('{{');
    expect(Object.keys(reading.files)).toEqual(['reading/fig.ld.json', 'reading/try.ld.json']);
    expect(reading.files['reading/try.ld.json']).toBe(readFileSync(join(FIXTURE, 'reading', 'try.ld.json'), 'utf8'));
    expect(reading.images).toEqual(['images/dot.png', 'images/panel.svg']);
    expect(existsSync(join(root, LESSON, 'reading', 'unused.ld.json'))).toBe(true);
  });
});

function scenarioId(): string {
  return (JSON.parse(readFileSync(join(LESSONS_DIRECTORY, LESSON, 'scenario.json'), 'utf8')) as { id: string }).id;
}
