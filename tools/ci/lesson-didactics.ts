// The didactics check of the Learn course: one table per lesson and five rules the course owner asked to keep true.
//
//   bun tools/ci/lesson-didactics.ts --check            fail on a rule broken by a lesson that is not in the baseline, on a baseline entry
//                                                       that no longer occurs, and on a stale table (CI runs this through the test)
//   bun tools/ci/lesson-didactics.ts --write            regenerate specs/012-zplc-2-1-plant-simulation/lesson-didactics.md
//   bun tools/ci/lesson-didactics.ts --write-baseline   rewrite tools/ci/lesson-didactics-baseline.json; it may only shrink, so it refuses a
//                                                       new offence (fix the lesson); the first run, with no baseline file, writes it all
//
// The rules, per lesson (the owner's brief, ids are the baseline keys):
//   reading     a reading page exists in English and in Spanish
//   check       the Run stage names the Check control, by its label in the i18n catalogue (learn.check) in each language
//   vocabulary  no learner-facing field (all that Learn shows, and the reading pages) uses the evidence vocabulary: VOCABULARY below,
//               whole words, any case, both languages
//   order       in courseOrder no lesson comes before the lesson that explains an idea it practises (tools/ci/lesson-ideas.json)
//   glossary    no learner text uses a synonym the glossary rules out (tools/ci/glossary-terms.json: one term per concept and language)
// The baseline (tools/ci/lesson-didactics-baseline.json) is the ratchet: today's known offences. A fixed lesson must leave it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { learnEn, learnEs } from '../../packages/zplc-ide/src/i18n/catalog/learn';
import { courseOrder } from '../../packages/zplc-ide/src/learn/course';
import type { LessonText } from '../../packages/zplc-ide/src/learn/lessonPackage';
import { buildIndex, loadCourse, loadLessonPackages } from '../../packages/zplc-ide/src/learn/lessonPackageFiles';

const ROOT = resolve(import.meta.dir, '../..');
export const TABLE_FILE = join(ROOT, 'specs/012-zplc-2-1-plant-simulation/lesson-didactics.md');
export const BASELINE_FILE = join(import.meta.dir, 'lesson-didactics-baseline.json');
const IDEAS_FILE = join(import.meta.dir, 'lesson-ideas.json');
const TERMS_FILE = join(import.meta.dir, 'glossary-terms.json');
const GLOSSARY_PAGES = {
  en: join(ROOT, 'docs/docs/learn/glossary.md'),
  es: join(ROOT, 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/glossary.md'),
};

export const RULES = ['reading', 'check', 'vocabulary', 'order', 'glossary'] as const;
export type Rule = (typeof RULES)[number];
type Lang = 'en' | 'es';
const LANGS: readonly Lang[] = ['en', 'es'];

/** The evidence vocabulary of the project (review finding L6): a learner has no use for it. The one place the words are listed. */
export const VOCABULARY: Record<Lang, readonly string[]> = {
  en: ['POSIX', 'HIL', 'certification', 'host evidence'],
  es: ['POSIX', 'HIL', 'certificación', 'evidencia del host', 'evidencia guardada del host', 'equipo anfitrión'],
};

export interface Term {
  concept: string;
  en: string;
  es: string;
  /** Synonyms that must not appear, per language of the learner text. */
  forbidden: { en: string[]; es: string[] };
  /** false: the glossary page has no row for it yet, so its terms are not cross-checked against the page. */
  glossary?: boolean;
}
export interface Ideas {
  ideas: Record<string, { explainedBy: string }>;
  practises: Record<string, string[]>;
}
export interface LessonFacts {
  id: string;
  module: number;
  languages: string[];
  minutes: number;
  reading: Record<Lang, boolean>;
  /** The reading pages' text, for the vocabulary and glossary rules. */
  readingText: Record<Lang, string>;
  /** Non-comment lines the solution adds to the starter, for ST and IL lessons only. */
  codeLines: number | null;
  hasWrongSet: boolean;
  text: Record<Lang, LessonText>;
}
export interface Input {
  /** In courseOrder. */
  lessons: LessonFacts[];
  checkLabel: Record<Lang, string>;
  ideas: Ideas;
  terms: Term[];
}
export interface Row {
  position: number;
  lesson: LessonFacts;
  namesCheck: Record<Lang, boolean>;
  /** Offence detail per rule; a rule absent from the map holds. */
  offences: Partial<Record<Rule, string>>;
}

const escape = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word, case-insensitive match (a hyphen joins words, so `estop-interlocks` is a name, not the word);  `sensitive` keeps the case (for a control label). */
export function hasWord(text: string, phrase: string, sensitive = false): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escape(phrase)}(?![\\p{L}\\p{N}_-])`, sensitive ? 'u' : 'iu').test(text);
}

/** Every field Learn shows of a lesson (LearnPanel: title, summary, objectives, stages, scope, fault cases, hints). */
export function learnerText(text: LessonText): string {
  return [
    text.title,
    text.summary,
    text.scope,
    ...text.objectives,
    ...text.stages.flatMap((stage) => [stage.title, stage.body, stage.checkpoint]),
    ...text.hints.map((hint) => hint.text),
    ...text.faultCases,
  ].join('\n');
}

/** A `{{t:10}}` or `{{assertions}}` placeholder is filled in by Learn, so its name is not learner text. */
const unplaced = (text: string): string => text.replace(/\{\{[^}]*\}\}/g, '');

const SEPARATOR = ', ';
export function evaluate(input: Input): Row[] {
  const position = new Map(input.lessons.map((lesson, index) => [lesson.id, index]));
  return input.lessons.map((lesson, index) => {
    const offences: Partial<Record<Rule, string>> = {};
    const full = (lang: Lang) => unplaced(`${learnerText(lesson.text[lang])}\n${lesson.readingText[lang]}`);
    const run = (lang: Lang) => {
      const stage = lesson.text[lang].stages.find((candidate) => candidate.key === 'run');
      return stage ? unplaced(`${stage.title}\n${stage.body}\n${stage.checkpoint}`) : '';
    };
    const namesCheck = Object.fromEntries(LANGS.map((lang) => [lang, hasWord(run(lang), input.checkLabel[lang], true)])) as Record<Lang, boolean>;

    const noReading = LANGS.filter((lang) => !lesson.reading[lang]);
    if (noReading.length > 0) offences.reading = `no ${noReading.join(SEPARATOR)}`;
    const noCheck = LANGS.filter((lang) => !namesCheck[lang]);
    if (noCheck.length > 0) offences.check = `no ${noCheck.join(SEPARATOR)}`;
    const words = LANGS.flatMap((lang) => VOCABULARY[lang].filter((word) => hasWord(full(lang), word)).map((word) => `${word} (${lang})`));
    if (words.length > 0) offences.vocabulary = words.join(SEPARATOR);
    const early = (input.ideas.practises[lesson.id] ?? []).filter((idea) => {
      const explainer = position.get(input.ideas.ideas[idea]?.explainedBy ?? '');
      return explainer !== undefined && index < explainer;
    });
    if (early.length > 0) offences.order = early.map((idea) => `${idea} < ${input.ideas.ideas[idea]!.explainedBy}`).join(SEPARATOR);
    const wrongTerms = input.terms.flatMap((term) =>
      LANGS.flatMap((lang) => term.forbidden[lang].filter((word) => hasWord(full(lang), word)).map((word) => `${word} (${lang}, use ${term[lang]})`)),
    );
    if (wrongTerms.length > 0) offences.glossary = wrongTerms.join(SEPARATOR);
    return { position: index + 1, lesson, namesCheck, offences };
  });
}

/** Problems of the two committed mappings themselves (not baselined): an unknown lesson or idea, a term missing from the glossary page. */
export function mappingProblems(input: Input, glossary?: Record<Lang, string>): string[] {
  const ids = new Set(input.lessons.map((lesson) => lesson.id));
  const problems: string[] = [];
  for (const [idea, { explainedBy }] of Object.entries(input.ideas.ideas)) {
    if (!ids.has(explainedBy)) problems.push(`lesson-ideas.json: idea "${idea}" is explained by "${explainedBy}", which is not a lesson`);
  }
  for (const [id, ideas] of Object.entries(input.ideas.practises)) {
    if (!ids.has(id)) problems.push(`lesson-ideas.json: practises names "${id}", which is not a lesson`);
    for (const idea of ideas) if (!input.ideas.ideas[idea]) problems.push(`lesson-ideas.json: "${id}" practises the unknown idea "${idea}"`);
  }
  for (const term of input.terms) {
    for (const lang of LANGS) {
      if (glossary && term.glossary !== false && !glossary[lang].toLowerCase().includes(term[lang].toLowerCase())) {
        problems.push(`glossary-terms.json: "${term[lang]}" (${term.concept}, ${lang}) is not on the glossary page; set "glossary": false if the row is still to come`);
      }
    }
  }
  return problems;
}

export const offenceKeys = (rows: readonly Row[]): string[] =>
  rows.flatMap((row) => RULES.filter((rule) => row.offences[rule] !== undefined).map((rule) => `${row.lesson.id}:${rule}`)).sort();

/** The ratchet: offences the baseline does not list, and baseline entries that no longer occur. */
export function ratchet(rows: readonly Row[], baseline: readonly string[]): { added: string[]; stale: string[] } {
  const now = new Set(offenceKeys(rows));
  const known = new Set(baseline);
  return { added: [...now].filter((key) => !known.has(key)), stale: [...known].filter((key) => !now.has(key)) };
}

const yes = (value: boolean) => (value ? 'yes' : 'no');
export function renderTable(rows: readonly Row[]): string {
  const cell = (row: Row, rule: Rule) => (row.offences[rule] ?? 'ok').replaceAll('|', '/');
  const counts = RULES.map((rule) => `- \`${rule}\`: ${rows.filter((row) => row.offences[rule] !== undefined).length} of ${rows.length} lessons break it`);
  return [
    '# Lesson didactics',
    '',
    'GENERATED by `tools/ci/lesson-didactics.ts`; do not edit. `bun tools/ci/lesson-didactics.ts --write` regenerates it and `--check` fails when it is stale.',
    'Lessons are in full-course order (`courseOrder`). "Code lines to add" counts the non-comment lines the solution adds to the starter, for ST and IL only.',
    'The last five columns are the rules of the script header: `ok`, or what breaks it.',
    '',
    ...counts,
    '',
    '| # | Lesson | Module | Language | Minutes | Reading | Code lines to add | Text names Check | Wrong-program set | reading | check | vocabulary | order | glossary |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) =>
      [
        row.position,
        `\`${row.lesson.id}\``,
        row.lesson.module,
        row.lesson.languages.join('/'),
        row.lesson.minutes,
        yes(row.lesson.reading.en && row.lesson.reading.es),
        row.lesson.codeLines ?? '',
        yes(row.namesCheck.en && row.namesCheck.es),
        yes(row.lesson.hasWrongSet),
        ...RULES.map((rule) => cell(row, rule)),
      ].join(' | ').replace(/^/, '| ').concat(' |'),
    ),
    '',
  ].join('\n');
}

/** The rows of the glossary table's two columns, lower-cased, for the cross-check of glossary-terms.json. */
const glossaryCells = (markdown: string): string =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, 3).join(' | '))
    .join('\n');

const codeLinesOf = (source: string): string[] =>
  source
    .replace(/\(\*[\s\S]*?\*\)/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'));
function linesAdded(starter: string, solution: string): number {
  const left = new Map<string, number>();
  for (const line of codeLinesOf(starter)) left.set(line, (left.get(line) ?? 0) + 1);
  return codeLinesOf(solution).filter((line) => {
    const count = left.get(line) ?? 0;
    left.set(line, count - 1);
    return count <= 0;
  }).length;
}

/** A reading page without the `src:` and `rung:` lines of its figure blocks, which name files and rungs, not words a learner reads. */
const prose = (markdown = ''): string => markdown.replace(/^(src|rung):.*$/gm, '');

/** The real tree, read: lesson packages, course.json, starters and solutions, the catalogue, the two mappings. */
export function loadInput(): { input: Input; glossary: Record<Lang, string>; problems: string[] } {
  const { packages, problems } = loadLessonPackages();
  const { course, problems: courseProblems } = loadCourse();
  problems.push(...courseProblems);
  if (!course) throw new Error(`lessons/course.json: ${problems.join('; ')}`);
  const built = buildIndex(packages, course);
  problems.push(...built.problems);
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const projects = join(ROOT, 'packages/zplc-ide/projects');
  const read = (project: { project: string; program: string }) => readFileSync(join(projects, project.project, project.program), 'utf8');
  const lessons = courseOrder(built.index).map((entry): LessonFacts => {
    const pkg = byId.get(entry.id)!;
    const textOnly = pkg.manifest.languages.every((language) => language === 'ST' || language === 'IL');
    return {
      id: pkg.id,
      module: pkg.manifest.module,
      languages: pkg.manifest.languages,
      minutes: pkg.manifest.estimatedMinutes,
      reading: { en: existsSync(join(pkg.directory, 'reading.en.md')), es: existsSync(join(pkg.directory, 'reading.es.md')) },
      readingText: { en: prose(pkg.reading?.en), es: prose(pkg.reading?.es) },
      codeLines: textOnly ? linesAdded(read(pkg.manifest.starter), read(pkg.manifest.solution)) : null,
      hasWrongSet: (pkg.checks?.wrong.length ?? 0) > 0,
      text: pkg.texts,
    };
  });
  const input: Input = {
    lessons,
    checkLabel: { en: learnEn['learn.check'], es: learnEs['learn.check'] },
    ideas: JSON.parse(readFileSync(IDEAS_FILE, 'utf8')) as Ideas,
    terms: (JSON.parse(readFileSync(TERMS_FILE, 'utf8')) as { terms: Term[] }).terms,
  };
  const glossary = {
    en: glossaryCells(readFileSync(GLOSSARY_PAGES.en, 'utf8')),
    es: glossaryCells(readFileSync(GLOSSARY_PAGES.es, 'utf8')),
  };
  return { input, glossary, problems };
}

const readBaseline = (): string[] | undefined =>
  existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as { offences: string[] }).offences : undefined;
const baselineText = (keys: readonly string[]): string => `${JSON.stringify({ offences: [...keys].sort() }, null, 2)}\n`;

/** Every problem of the tree against the committed table and baseline; empty when it holds. */
export function check(rows: readonly Row[], baseline: readonly string[], table: string | undefined, mapping: readonly string[]): string[] {
  const { added, stale } = ratchet(rows, baseline);
  return [
    ...mapping,
    ...added.map((key) => `new offence ${key}: fix the lesson (the baseline only shrinks)`),
    ...stale.map((key) => `${key} no longer occurs: remove it from the baseline (--write-baseline)`),
    ...(table === renderTable(rows) ? [] : ['specs/012-zplc-2-1-plant-simulation/lesson-didactics.md is stale: run --write']),
  ];
}

if (import.meta.main) {
  const flag = process.argv[2];
  const { input, glossary, problems: loading } = loadInput();
  const rows = evaluate(input);
  const mapping = [...loading, ...mappingProblems(input, glossary)];
  if (flag === '--write') {
    writeFileSync(TABLE_FILE, renderTable(rows));
    console.log(`wrote ${TABLE_FILE}`);
  } else if (flag === '--write-baseline') {
    const previous = readBaseline();
    const { added } = ratchet(rows, previous ?? offenceKeys(rows));
    if (added.length > 0) {
      console.error(`refusing to grow the baseline: ${added.join(', ')}`);
      process.exit(1);
    }
    writeFileSync(BASELINE_FILE, baselineText(offenceKeys(rows)));
    console.log(`wrote ${BASELINE_FILE} (${offenceKeys(rows).length} offences)`);
  } else if (flag === '--check') {
    const table = existsSync(TABLE_FILE) ? readFileSync(TABLE_FILE, 'utf8') : undefined;
    const problems = check(rows, readBaseline() ?? [], table, mapping);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`lesson didactics: ${rows.length} lessons, ${offenceKeys(rows).length} known offences, none new`);
  } else {
    console.error('usage: lesson-didactics.ts --check | --write | --write-baseline');
    process.exit(2);
  }
}
