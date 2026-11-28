// The didactics check of the Learn course: one table per lesson and the rules the course owner asked to keep true (CRS-014 to CRS-023).
//
//   bun tools/ci/lesson-didactics.ts --check            fail on a rule broken by a lesson that is not in the baseline, on a baseline entry
//                                                       that no longer occurs, and on a stale table (CI runs this through the test)
//   bun tools/ci/lesson-didactics.ts --write            regenerate specs/012-zplc-2-1-plant-simulation/lesson-didactics.md
//   bun tools/ci/lesson-didactics.ts --write-baseline   rewrite tools/ci/lesson-didactics-baseline.json; it may only shrink, so it
//                                                       refuses a new offence (fix the lesson); the first run, with no
//                                                       baseline file, writes it all
//
// The rules, per lesson (the owner's brief, ids are the baseline keys):
//   reading     a reading page exists in English and in Spanish
//   check       the Run stage names the Check control, by its label in the i18n catalogue (learn.check) in each language,
//               written out or through the placeholder {{ui:learn.check}} (CRS-019), which the index expands to that label
//   vocabulary  no learner-facing field (all that Learn shows, and the reading pages) uses the evidence vocabulary: VOCABULARY below,
//               whole words, any case, both languages
//   order       in courseOrder no lesson comes before the lesson that explains an idea it practises (tools/ci/lesson-ideas.json)
//   glossary    no learner text uses a synonym the glossary rules out (tools/ci/glossary-terms.json: one term per concept and language);
//               a forbidden word right before a {{ui:<key>}} placeholder names a Studio control ("el botón {{ui:learn.check}}")
//   reading-parts  each reading page that exists has an image or a timing, ld-figure or ld-try block, a quiz block and the level-2
//               headings "Worked example" and "Common mistakes" ("Ejemplo resuelto", "Errores comunes") (CRS-014)
//   answer      for ST and IL, the candidates are each code line the solution adds to the starter (a line of one word such as VAR
//               or END_IF; is a frame, not an answer) and, for ST, each statement it adds (split at `;`) and the right-hand side
//               of each added assignment `name := …`, when that statement or side is more than ANSWER_PART_MIN characters once
//               normalised. Spaces are normalised, a candidate the starter already holds is dropped, and the match is
//               case-sensitive, so the operator words (AND, OR, ADD, MOD, LD, ST) count only in their code form. No candidate may
//               be in the objectives, any stage (Reflect included), the fault cases or a hint other than the last, read with
//               {{v:…|X}} as X and {{t:N}} as N (CRS-017). A worked example that becomes the solution once its variables are
//               renamed is not detected: a person reads that at the owner's stops. tools/ci/lesson-answer-exceptions.json
//               names, per lesson, the fragments that are the specification, not the fix, each with its reason; only those leave
//               the rule

//   grows       the starter of the last lesson of each module of a path (course.json) holds at most two statements beyond its
//               declarations (ST, IL: `;` of a body, instruction lines) or no rung, connection, transition or step beyond the initial
//               one (LD, FBD, SFC); the column "Starter statements" shows that count for every lesson (CRS-018)
//   scope       no checkpoint holds SCOPE_WORDS below, except the board term in SCOPE_EXEMPT's lessons; the lesson's scope says
//               what a pass proves (CRS-020)
//   machine     each reading page of a lesson that names a scene embeds images/machine.<lang>.png and the signal tables that
//               scripts/learn/signal-table.ts gives for that scene, row by row and cell by cell (CRS-016)
// And per construct of the compiler support matrix (specs/012-zplc-2-1-plant-simulation/course-l7-support.md), baseline key
// `<slug>:explainer`: a construct marked "Teach" in some language needs an idea of that slug in lesson-ideas.json, so that it has an
// explainer and the rule `order` holds for it (CRS-023). The slug is the construct, lower case, each run of other characters a "-":
// "User FUNCTION" is `user-function`, "AND, OR, XOR, NOT on BYTE, WORD, DWORD" is `and-or-xor-not-on-byte-word-dword`.
// The baseline (tools/ci/lesson-didactics-baseline.json) is the ratchet: today's known offences. A fixed lesson must leave it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { learnEn, learnEs } from '../../packages/zplc-ide/src/i18n/catalog/learn';
import { courseOrder } from '../../packages/zplc-ide/src/learn/course';
import { uiLabel, type LessonText } from '../../packages/zplc-ide/src/learn/lessonPackage';
import { tablesOf } from '../../packages/zplc-ide/scripts/learn/signal-table';
import { buildIndex, loadCourse, loadLessonPackages } from '../../packages/zplc-ide/src/learn/lessonPackageFiles';

const ROOT = resolve(import.meta.dir, '../..');
export const TABLE_FILE = join(ROOT, 'specs/012-zplc-2-1-plant-simulation/lesson-didactics.md');
export const BASELINE_FILE = join(import.meta.dir, 'lesson-didactics-baseline.json');
const IDEAS_FILE = join(import.meta.dir, 'lesson-ideas.json');
const TERMS_FILE = join(import.meta.dir, 'glossary-terms.json');
const EXCEPTIONS_FILE = join(import.meta.dir, 'lesson-answer-exceptions.json');
const MATRIX_FILE = join(ROOT, 'specs/012-zplc-2-1-plant-simulation/course-l7-support.md');
const GLOSSARY_PAGES = {
  en: join(ROOT, 'docs/docs/learn/glossary.md'),
  es: join(ROOT, 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/glossary.md'),
};

export const RULES = [
  'reading',
  'check',
  'vocabulary',
  'order',
  'glossary',
  'reading-parts',
  'answer',
  'grows',
  'scope',
  'machine',
] as const;
export type Rule = (typeof RULES)[number];
type Lang = 'en' | 'es';
const LANGS: readonly Lang[] = ['en', 'es'];

/** The evidence vocabulary of the project (review finding L6): a learner has no use for it. The one place the words are listed. */
export const VOCABULARY: Record<Lang, readonly string[]> = {
  en: ['POSIX', 'HIL', 'certification', 'host evidence'],
  es: ['POSIX', 'HIL', 'certificación', 'evidencia del host', 'evidencia guardada del host', 'equipo anfitrión'],
};

/** What a pass proves is said once, in the scope: a checkpoint never names these (CRS-020). Whole words, any case. */
export const SCOPE_WORDS: Record<Lang, readonly string[]> = {
  en: ['simulator', 'real machine', 'board', 'safety'],
  es: ['simulador', 'máquina real', 'placa de desarrollo', 'placas de desarrollo', 'seguridad'],
};
/** Lessons about the board itself: the board term may stand in their checkpoints, the other scope words may not. */
export const SCOPE_EXEMPT: Record<string, readonly string[]> = {
  'verify-my-board': ['board', 'placa de desarrollo', 'placas de desarrollo'],
};
const HEADINGS: Record<Lang, readonly string[]> = {
  en: ['Worked example', 'Common mistakes'],
  es: ['Ejemplo resuelto', 'Errores comunes'],
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
  /** The reading pages as written, for the rules reading-parts and machine. */
  readingSource: Record<Lang, string>;
  /** Non-comment lines the solution adds to the starter, trimmed, for ST and IL lessons only. */
  addedLines: string[] | null;
  /** Structured Text statements (split at `;`) of the solution that the starter lacks, for the rule answer; empty for other languages. */
  addedStatements: string[];
  /** The starter's program as written, for the rule answer: a candidate it already holds gives nothing away. */
  starterSource: string;
  /** Statements of the starter beyond its declarations; `graphic` for LD, FBD and SFC (rungs, connections, transitions, steps). */
  starter: { statements: number; graphic: boolean };
  /** For a lesson that names a scene: the image its page must show and the tables the scene gives, per language. */
  machine: Record<Lang, { image: string; table: string }> | null;
  hasWrongSet: boolean;
  text: Record<Lang, LessonText>;
}
export interface Input {
  /** In courseOrder. */
  lessons: LessonFacts[];
  checkLabel: Record<Lang, string>;
  ideas: Ideas;
  terms: Term[];
  /** The paths of course.json, for the rule grows. */
  paths: { id: string; lessons: string[] }[];
}
export interface Row {
  position: number;
  lesson: LessonFacts;
  namesCheck: Record<Lang, boolean>;
  /** Offence detail per rule; a rule absent from the map holds. */
  offences: Partial<Record<Rule, string>>;
}

const escape = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Whole-word, case-insensitive match (a hyphen joins words, so `estop-interlocks` is a name, not the word);
 * `sensitive` keeps the case (for a control label).
 */
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

/**
 * The text as the index generator expands it (expandQuotes): `{{ui:key}}` is the label of the catalogue (a key the catalogue
 * lacks is the lesson validator's problem), `{{t:N}}` is N, `{{v:…|X}}` is X; `{{assertions}}` and any other markup are left out.
 */
const unplaced = (text: string, lang: Lang): string =>
  text
    .replace(/\{\{ui:([\w.]+)\}\}/g, (markup, key: string) => uiLabel(lang, key) ?? markup)
    .replace(/\{\{t:(\d+)\}\}/g, '$1')
    .replace(/\{\{v:[^|}]*\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '');

const SEPARATOR = ', ';

/** One code line or text, spaces normalised: runs of spaces are one, and none is kept beside punctuation. */
const normalised = (code: string): string =>
  code
    .replace(/\s+/g, ' ')
    .replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1')
    .trim();

/**
 * A statement or right-hand side is a candidate of the rule answer only when it is longer than this, normalised: `A OR B`
 * (6 characters) is too common to be an answer, `(Raw*100)/1000` is not.
 */
const ANSWER_PART_MIN = 6;

/**
 * The written exceptions of the rule answer (tools/ci/lesson-answer-exceptions.json, a data file so that no source file lists
 * lesson ids, LRN-028): a fragment of the solution that the lesson's text must name because it is the specification, not the
 * fix, with its reason. Each one holds for its lesson only; any other candidate of that lesson still counts.
 */
export const ANSWER_EXCEPTIONS = (
  JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')) as {
    exceptions: Record<string, readonly { fragment: string; reason: string }[]>;
  }
).exceptions;

/** A line of one word, such as `VAR`, `ELSE` or `END_IF;`: the frame of a statement, not its answer. */
const KEYWORD_LINE = /^[\p{L}\p{N}_]+;?$/u;

/** Whether `text` holds `code`, case-sensitively, not as part of a longer name: only an end that is a letter or digit needs a boundary. */
const holdsCode = (text: string, code: string): boolean => {
  const word = /[\p{L}\p{N}_]/u;
  const before = word.test(code[0] ?? '') ? '(?<![\\p{L}\\p{N}_])' : '';
  const after = word.test(code.at(-1) ?? '') ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(`${before}${escape(code)}${after}`, 'u').test(text);
};

/** The rows of the Markdown tables in `markdown`, each as its trimmed cells joined by `|`, without the alignment rows. */
const tableRows = (markdown: string): string[] =>
  markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
        .join('|'),
    );

/** Per path, the lesson that ends each module in path order, and the path ids it ends a module of. */
function moduleEnds(input: Input): Map<string, string[]> {
  const moduleOf = new Map(input.lessons.map((lesson) => [lesson.id, lesson.module]));
  const ends = new Map<string, string[]>();
  for (const path of input.paths) {
    const last = new Map<number, string>();
    for (const id of path.lessons) if (moduleOf.has(id)) last.set(moduleOf.get(id)!, id);
    for (const id of last.values()) ends.set(id, [...(ends.get(id) ?? []), path.id]);
  }
  return ends;
}

export function evaluate(input: Input): Row[] {
  const position = new Map(input.lessons.map((lesson, index) => [lesson.id, index]));
  const ends = moduleEnds(input);
  return input.lessons.map((lesson, index) => {
    const offences: Partial<Record<Rule, string>> = {};
    const full = (lang: Lang) => unplaced(`${learnerText(lesson.text[lang])}\n${lesson.readingText[lang]}`, lang);
    const run = (lang: Lang) => {
      const stage = lesson.text[lang].stages.find((candidate) => candidate.key === 'run');
      return stage ? unplaced(`${stage.title}\n${stage.body}\n${stage.checkpoint}`, lang) : '';
    };
    const namesCheck = Object.fromEntries(LANGS.map((lang) => [lang, hasWord(run(lang), input.checkLabel[lang], true)])) as Record<
      Lang,
      boolean
    >;

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
      LANGS.flatMap((lang) =>
        term.forbidden[lang]
          .filter((word) => {
            const raw = `${learnerText(lesson.text[lang])}\n${lesson.readingText[lang]}`;
            return hasWord(unplaced(raw.replace(new RegExp(`${escape(word)}(?=\\s+\\{\\{ui:)`, 'giu'), ''), lang), word);
          })
          .map((word) => `${word} (${lang}, use ${term[lang]})`),
      ),
    );
    if (wrongTerms.length > 0) offences.glossary = wrongTerms.join(SEPARATOR);

    const pages = LANGS.filter((lang) => lesson.reading[lang]);
    const missingParts = pages.flatMap((lang) => {
      const source = lesson.readingSource[lang];
      const missing: string[] = [];
      if (!/^!\[[^\]]*\]\(/m.test(source) && !/^```(?:timing|ld-figure|ld-try)\s*$/m.test(source)) missing.push('no figure');
      if (!/^```quiz\s*$/m.test(source)) missing.push('no quiz');
      for (const heading of HEADINGS[lang])
        if (!new RegExp(`^## ${escape(heading)}\\s*$`, 'm').test(source)) missing.push(`no "${heading}"`);
      return missing.map((what) => `${what} (${lang})`);
    });
    if (missingParts.length > 0) offences['reading-parts'] = missingParts.join(SEPARATOR);

    if (lesson.addedLines) {
      const told = (lang: Lang) => {
        const t = lesson.text[lang];
        return normalised(
          unplaced(
            [
              ...t.objectives,
              ...t.stages.flatMap((stage) => [stage.title, stage.body, stage.checkpoint]),
              ...t.faultCases,
              ...t.hints.slice(0, -1).map((hint) => hint.text),
            ].join('\n'),
            lang,
          ),
        );
      };
      const parts = lesson.addedStatements
        .flatMap((statement) => [statement, /^[\w.[\]]+\s*:=/.test(statement) ? statement.slice(statement.indexOf(':=') + 2) : ''])
        .map(normalised);
      const starter = normalised(lesson.starterSource);
      const exempt = new Set((ANSWER_EXCEPTIONS[lesson.id] ?? []).map(({ fragment }) => normalised(fragment)));
      const candidates = [
        ...new Set([...lesson.addedLines!.map(normalised), ...parts.filter((part) => part.length > ANSWER_PART_MIN)]),
      ].filter((candidate) => !holdsCode(starter, candidate) && !exempt.has(candidate));
      const given = LANGS.flatMap((lang) =>
        candidates.filter((line) => !KEYWORD_LINE.test(line) && holdsCode(told(lang), line)).map((line) => `${line} (${lang})`),
      );
      if (given.length > 0) offences.answer = given.join(SEPARATOR);
    }

    const endOf = ends.get(lesson.id);
    if (endOf && lesson.starter.statements > (lesson.starter.graphic ? 0 : 2))
      offences.grows = `${lesson.starter.statements} starter statements, last of module ${lesson.module} in ${endOf.join(SEPARATOR)}`;

    const scopeWords = LANGS.flatMap((lang) =>
      SCOPE_WORDS[lang]
        .filter((word) => !SCOPE_EXEMPT[lesson.id]?.includes(word))
        .filter((word) => lesson.text[lang].stages.some((stage) => hasWord(unplaced(stage.checkpoint, lang), word)))
        .map((word) => `${word} (${lang})`),
    );
    if (scopeWords.length > 0) offences.scope = scopeWords.join(SEPARATOR);

    if (lesson.machine) {
      const machine = lesson.machine;
      const lacking = pages.flatMap((lang) => {
        const source = lesson.readingSource[lang];
        const rows = tableRows(source).join('\n');
        const missing: string[] = [];
        if (!source.includes(`](${machine[lang].image})`)) missing.push(`no image (${lang})`);
        const tables = machine[lang].table
          .split(/\n\s*\n/)
          .map(tableRows)
          .filter((table) => table.length > 0);
        if (!tables.every((table) => `\n${rows}\n`.includes(`\n${table.join('\n')}\n`))) missing.push(`no table (${lang})`);
        return missing;
      });
      if (lacking.length > 0) offences.machine = lacking.join(SEPARATOR);
    }
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
    for (const idea of ideas)
      if (!input.ideas.ideas[idea]) problems.push(`lesson-ideas.json: "${id}" practises the unknown idea "${idea}"`);
  }
  for (const term of input.terms) {
    for (const lang of LANGS) {
      if (glossary && term.glossary !== false && !glossary[lang].toLowerCase().includes(term[lang].toLowerCase())) {
        problems.push(
          `glossary-terms.json: "${term[lang]}" (${term.concept}, ${lang}) is not on the glossary page; ` +
            'set "glossary": false if the row is still to come',
        );
      }
    }
  }
  return problems;
}

/** `<slug>:explainer` for each construct the matrix marks "Teach" in some language and lesson-ideas.json has no idea for (CRS-023). */
export function unexplainedConstructs(matrix: string, ideas: Ideas): string[] {
  return tableRows(matrix)
    .slice(1)
    .map((row) => row.split('|'))
    .filter((cells) => cells.slice(1).some((cell) => cell.startsWith('Teach')))
    .map((cells) =>
      cells[0]!
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter((slug) => !ideas.ideas[slug])
    .map((slug) => `${slug}:explainer`)
    .sort();
}

export const offenceKeys = (rows: readonly Row[], constructs: readonly string[] = []): string[] =>
  [
    ...rows.flatMap((row) => RULES.filter((rule) => row.offences[rule] !== undefined).map((rule) => `${row.lesson.id}:${rule}`)),
    ...constructs,
  ].sort();

/** The ratchet: offences the baseline does not list, and baseline entries that no longer occur. */
export function ratchet(
  rows: readonly Row[],
  baseline: readonly string[],
  constructs: readonly string[] = [],
): { added: string[]; stale: string[] } {
  const now = new Set(offenceKeys(rows, constructs));
  const known = new Set(baseline);
  return { added: [...now].filter((key) => !known.has(key)), stale: [...known].filter((key) => !now.has(key)) };
}

const yes = (value: boolean) => (value ? 'yes' : 'no');
export function renderTable(rows: readonly Row[], constructs: readonly string[] = []): string {
  const cell = (row: Row, rule: Rule) => (row.offences[rule] ?? 'ok').replaceAll('|', '/');
  const unexplained = constructs.length === 0 ? 'none' : constructs.map((key) => `\`${key.split(':')[0]}\``).join(', ');
  const counts = RULES.map(
    (rule) => `- \`${rule}\`: ${rows.filter((row) => row.offences[rule] !== undefined).length} of ${rows.length} lessons break it`,
  );
  return [
    '# Lesson didactics',
    '',
    'GENERATED by `tools/ci/lesson-didactics.ts`; do not edit. ' +
      '`bun tools/ci/lesson-didactics.ts --write` regenerates it and `--check` fails when it is stale.',
    'Lessons are in full-course order (`courseOrder`). ' +
      '"Code lines to add" counts the non-comment lines the solution adds to the starter, for ST and IL only. ' +
      '"Starter statements" counts what the starter holds beyond its declarations (rule `grows`).',
    `The last ${RULES.length} columns are the rules of the script header: \`ok\`, or what breaks it.`,
    '',
    ...counts,
    `- constructs of the compiler support matrix without an explainer: ${unexplained}`,
    '',
    '| # | Lesson | Module | Language | Minutes | Reading | Code lines to add | Starter statements | Text names Check ' +
      `| Wrong-program set | ${RULES.join(' | ')} |`,
    `|${'---|'.repeat(10 + RULES.length)}`,
    ...rows.map((row) =>
      [
        row.position,
        `\`${row.lesson.id}\``,
        row.lesson.module,
        row.lesson.languages.join('/'),
        row.lesson.minutes,
        yes(row.lesson.reading.en && row.lesson.reading.es),
        row.lesson.addedLines?.length ?? '',
        row.lesson.starter.statements,
        yes(row.namesCheck.en && row.namesCheck.es),
        yes(row.lesson.hasWrongSet),
        ...RULES.map((rule) => cell(row, rule)),
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |'),
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

/** Statements of a starter beyond its declarations, by the kind of its program file. */
export function starterStatements(file: string, source: string): { statements: number; graphic: boolean } {
  if (file.endsWith('.json')) {
    const model = JSON.parse(source) as {
      rungs?: { grid?: { element?: unknown }[][] }[];
      connections?: unknown[];
      steps?: { isInitial?: boolean }[];
      transitions?: unknown[];
    };
    const rungs = (model.rungs ?? []).filter((rung) => (rung.grid ?? []).some((row) => row.some((cell) => cell?.element))).length;
    const steps = (model.steps ?? []).filter((step) => !step.isInitial).length;
    return { statements: rungs + (model.connections?.length ?? 0) + steps + (model.transitions?.length ?? 0), graphic: true };
  }
  const body = codeLinesOf(source.replace(/\b(VAR\w*)\b[\s\S]*?\bEND_VAR\b/g, ''))
    .filter((line) => !/^(?:END_)?(?:PROGRAM|FUNCTION_BLOCK|FUNCTION)\b/.test(line))
    .join('\n');
  const statements = file.endsWith('.il')
    ? body.split('\n').filter((line) => line !== '' && !/^\w+:$/.test(line)).length
    : (body.match(/;/g) ?? []).length;
  return { statements, graphic: false };
}

/** The ST statements (split at `;`, spaces normalised to one) of a solution's bodies that its starter's bodies lack. */
export function statementsAdded(starter: string, solution: string): string[] {
  const statements = (source: string) =>
    codeLinesOf(source.replace(/\b(VAR\w*)\b[\s\S]*?\bEND_VAR\b/g, ''))
      .filter((line) => !/^(?:END_)?(?:PROGRAM|FUNCTION_BLOCK|FUNCTION)\b/.test(line))
      .join(' ')
      .split(';')
      .map((statement) => statement.replace(/\s+/g, ' ').trim())
      .filter((statement) => statement !== '');
  const left = new Map<string, number>();
  for (const statement of statements(starter)) left.set(statement, (left.get(statement) ?? 0) + 1);
  return statements(solution).filter((statement) => {
    const count = left.get(statement) ?? 0;
    left.set(statement, count - 1);
    return count <= 0;
  });
}

const codeLinesOf = (source: string): string[] =>
  source
    .replace(/\(\*[\s\S]*?\*\)/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'));
function linesAdded(starter: string, solution: string): string[] {
  const left = new Map<string, number>();
  for (const line of codeLinesOf(starter)) left.set(line, (left.get(line) ?? 0) + 1);
  return codeLinesOf(solution).filter((line) => {
    const count = left.get(line) ?? 0;
    left.set(line, count - 1);
    return count <= 0;
  });
}

/** A reading page without the `src:` and `rung:` lines of its figure blocks, which name files and rungs, not words a learner reads. */
const prose = (markdown = ''): string => markdown.replace(/^(src|rung):.*$/gm, '');

/** The real tree, read: lesson packages, course.json, starters and solutions, the catalogue, the two mappings. */
export function loadInput(): { input: Input; glossary: Record<Lang, string>; problems: string[]; matrix: string } {
  const { packages, problems } = loadLessonPackages();
  const { course, problems: courseProblems } = loadCourse();
  problems.push(...courseProblems);
  if (!course) throw new Error(`lessons/course.json: ${problems.join('; ')}`);
  const built = buildIndex(packages, course);
  problems.push(...built.problems);
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const projects = join(ROOT, 'packages/zplc-ide/projects');
  const read = (project: { project: string; program: string }) => readFileSync(join(projects, project.project, project.program), 'utf8');
  const scenes = [...new Set(packages.flatMap((pkg) => (pkg.manifest.scene ? [pkg.manifest.scene] : [])))];
  const tables = tablesOf(scenes);
  problems.push(...tables.problems);
  const tableOf = new Map(tables.files.map((file) => [file.path, file.text]));
  const lessons = courseOrder(built.index).map((entry): LessonFacts => {
    const pkg = byId.get(entry.id)!;
    const textOnly = pkg.manifest.languages.every((language) => language === 'ST' || language === 'IL');
    const scene = pkg.manifest.scene;
    return {
      id: pkg.id,
      module: pkg.manifest.module,
      languages: pkg.manifest.languages,
      minutes: pkg.manifest.estimatedMinutes,
      reading: { en: existsSync(join(pkg.directory, 'reading.en.md')), es: existsSync(join(pkg.directory, 'reading.es.md')) },
      readingText: { en: prose(pkg.reading?.en), es: prose(pkg.reading?.es) },
      readingSource: { en: pkg.reading?.en ?? '', es: pkg.reading?.es ?? '' },
      addedLines: textOnly ? linesAdded(read(pkg.manifest.starter), read(pkg.manifest.solution)) : null,
      starterSource: read(pkg.manifest.starter),
      addedStatements: pkg.manifest.starter.program.endsWith('.st')
        ? statementsAdded(read(pkg.manifest.starter), read(pkg.manifest.solution))
        : [],
      starter: starterStatements(pkg.manifest.starter.program, read(pkg.manifest.starter)),
      machine: scene
        ? (Object.fromEntries(
            LANGS.map((lang) => [
              lang,
              { image: `images/machine.${lang}.png`, table: tableOf.get(join(scene, `signals.${lang}.md`)) ?? '' },
            ]),
          ) as Record<Lang, { image: string; table: string }>)
        : null,
      hasWrongSet: (pkg.checks?.wrong.length ?? 0) > 0,
      text: pkg.texts,
    };
  });
  const input: Input = {
    lessons,
    checkLabel: { en: learnEn['learn.check'], es: learnEs['learn.check'] },
    ideas: JSON.parse(readFileSync(IDEAS_FILE, 'utf8')) as Ideas,
    terms: (JSON.parse(readFileSync(TERMS_FILE, 'utf8')) as { terms: Term[] }).terms,
    paths: (course.paths ?? []).map((path) => ({ id: path.id, lessons: [...path.lessons] })),
  };
  const glossary = {
    en: glossaryCells(readFileSync(GLOSSARY_PAGES.en, 'utf8')),
    es: glossaryCells(readFileSync(GLOSSARY_PAGES.es, 'utf8')),
  };
  return { input, glossary, problems, matrix: readFileSync(MATRIX_FILE, 'utf8') };
}

const readBaseline = (): string[] | undefined =>
  existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as { offences: string[] }).offences : undefined;
const baselineText = (keys: readonly string[]): string => `${JSON.stringify({ offences: [...keys].sort() }, null, 2)}\n`;

/** Every problem of the tree against the committed table and baseline; empty when it holds. */
export function check(
  rows: readonly Row[],
  baseline: readonly string[],
  table: string | undefined,
  mapping: readonly string[],
  constructs: readonly string[] = [],
): string[] {
  const { added, stale } = ratchet(rows, baseline, constructs);
  return [
    ...mapping,
    ...added.map((key) => `new offence ${key}: fix the lesson (the baseline only shrinks)`),
    ...stale.map((key) => `${key} no longer occurs: remove it from the baseline (--write-baseline)`),
    ...(table === renderTable(rows, constructs) ? [] : ['specs/012-zplc-2-1-plant-simulation/lesson-didactics.md is stale: run --write']),
  ];
}

if (import.meta.main) {
  const flag = process.argv[2];
  const { input, glossary, problems: loading, matrix } = loadInput();
  const rows = evaluate(input);
  const constructs = unexplainedConstructs(matrix, input.ideas);
  const mapping = [...loading, ...mappingProblems(input, glossary)];
  if (flag === '--write') {
    writeFileSync(TABLE_FILE, renderTable(rows, constructs));
    console.log(`wrote ${TABLE_FILE}`);
  } else if (flag === '--write-baseline') {
    const previous = readBaseline();
    const now = offenceKeys(rows, constructs);
    const { added } = ratchet(rows, previous ?? now, constructs);
    if (added.length > 0) {
      console.error(`refusing to grow the baseline: ${added.join(', ')}`);
      process.exit(1);
    }
    writeFileSync(BASELINE_FILE, baselineText(now));
    console.log(`wrote ${BASELINE_FILE} (${now.length} offences)`);
  } else if (flag === '--check') {
    const table = existsSync(TABLE_FILE) ? readFileSync(TABLE_FILE, 'utf8') : undefined;
    const problems = check(rows, readBaseline() ?? [], table, mapping, constructs);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`lesson didactics: ${rows.length} lessons, ${offenceKeys(rows, constructs).length} known offences, none new`);
  } else {
    console.error('usage: lesson-didactics.ts --check | --write | --write-baseline');
    process.exit(2);
  }
}
