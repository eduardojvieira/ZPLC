import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import boardManifest from '../../../../firmware/app/boards/boards.json';
import kit from '../../lessons/kit.json';
import phrases from '../boards/wiring/phrases.json';

import { faceplateEs } from '../i18n/catalog/faceplate';
import { interlockEs } from '../i18n/catalog/interlock';
import { labEn, labEs } from '../i18n/catalog/lab';
import { labSceneEs } from '../i18n/catalog/labScene';
import { learnEs } from '../i18n/catalog/learn';
import { learnHomeEs } from '../i18n/catalog/learnHome';
import { translatorFor } from '../i18n';
import { es } from '../i18n/es';
import { expandText, textShape, type LessonTextExpanded } from './lessonPackage';
import { loadLessonPackages } from './lessonPackageFiles';

/**
 * LRN-029: every lesson, hint and plant label exists in English and Spanish with the same structure, and the Spanish is
 * in the register of decision D-10 (neutral Latin American Spanish, impersonal or "usted") with the terms of the Learn
 * glossary (docs/docs/learn/glossary.md). The register and the glossary are checked with short deny-lists of known wrong
 * forms, not with a language model: a new wrong form is added here when a review finds it.
 */
const { packages, problems } = loadLessonPackages();

/** Every string of a lesson text that a learner reads, with the quotes of the scenario expanded. */
function readable(text: LessonTextExpanded): string[] {
  return [
    text.title,
    text.summary,
    text.scope,
    ...text.objectives,
    ...text.faultCases,
    ...text.hints.map((hint) => hint.text),
    ...text.stages.flatMap((stage) => [stage.title, stage.body, stage.checkpoint]),
  ];
}

const spanish = packages.map((lesson) => ({ id: lesson.id, strings: readable(expandText(lesson.texts.es, lesson.scenario).text) }));

/**
 * A whole word, in any case, that is not part of a longer word, a code token or a file path: `ScanSnapshot` is not
 * "scan", and `tests/conveyor-jam-timing.scenario.json` is not "timing".
 */
const word = (pattern: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_/-])(?:${pattern})(?![\\p{L}\\p{N}_/-]|\\.\\p{L})`, 'giu');

/**
 * Forms that the "usted" register of D-10 never uses: the "tú" pronouns and possessives, the second-person verbs a lesson
 * asks with, the voseo imperatives with a pronoun (llamalo, borralo; the usted forms are llámelo, bórrelo) and the
 * Rioplatense "recién" for "only then". The other voseo forms (vos, tenés, agregá) are the deny-list of
 * tools/ci/i18n-guard.ts, which lessonCi.test.ts applies to every lesson and the i18n guard to every catalog.
 */
const REGISTER = word(
  [
    'tú',
    'tu',
    'tus',
    'te',
    'ti',
    'contigo',
    'tienes',
    'puedes',
    'debes',
    'quieres',
    'necesitas',
    'sabes',
    'eres',
    'estás',
    'haces',
    'haz',
    'pon',
    'completalo',
    'completala',
    'llamalo',
    'llamala',
    'borralo',
    'borrala',
    'liberalo',
    'liberala',
    'agregalo',
    'agregala',
    'guardalo',
    'guardala',
    'ponelo',
    'ponela',
    'abrilo',
    'abrila',
    'probalo',
    'probala',
    'recién (?:después|cuando|entonces|al|ahí)',
  ].join('|'),
);

/** Known wrong variants of the glossary terms, each with the glossary term that replaces it. */
const WRONG_VARIANTS: ReadonlyArray<readonly [RegExp, string]> = [
  [word('ciclo de scan|scans?'), 'ciclo de escaneo, or ciclo'],
  [word('rungs?|escal[oó]n|escalones'), 'peldaño'],
  [word('seal-in'), 'autorretención'],
  [word('interbloqueos?|interlocks?'), 'enclavamiento'],
  [word('fallos?'), 'falla'],
  [word('flancos? de subida'), 'flanco ascendente'],
  [word('bloques? funcional(?:es)?'), 'bloque de función'],
  [word('starter'), 'programa inicial, or proyecto inicial'],
  [word('samples?'), 'muestra'],
  [word('chequeos?'), 'comprobación'],
  [word('tabla watch'), 'tabla de observación'],
  [word('assertions?'), 'aserción'],
  [word('timing'), 'tiempos, temporización'],
  [word('target'), 'dispositivo de destino'],
  [word('inputs?|outputs?'), 'entradas, salidas'],
  [word('resetear|resetee'), 'poner a cero'],
  [word('snapshots?'), 'instantánea'],
  [/(?<![\p{L}\p{N}_/-])Tests(?![\p{L}\p{N}_/-])/gu, 'Pruebas'],
  [word('pedido peatonal|pedido de cinta|el pedido'), 'solicitud'],
  [/(?<![\p{L}])(?:Structured Text|Texto Estructurado)(?![\p{L}])/gu, 'texto estructurado'],
  [/(?<![\p{L}])(?:Instruction List|Lista de Instrucciones)(?![\p{L}])/gu, 'lista de instrucciones'],
  [/(?<![\p{L}])(?:Function Block Diagram|Diagrama de Bloques de Función)(?![\p{L}])/gu, 'diagrama de bloques de función'],
  [/(?<![\p{L}])(?:Sequential Function Chart|Gráfico Funcional de Secuencias)(?![\p{L}])/gu, 'diagrama funcional secuencial'],
  [word('diagrama funcional de secuencias|gráfico funcional de secuencias'), 'diagrama funcional secuencial'],
  [/(?<![\p{L}])Ladder(?![\p{L}])/gu, 'diagrama de escalera'],
];

/**
 * Every form the patterns find in labelled texts. The texts are scanned joined first, so the usual case, nothing found,
 * costs one pass per pattern instead of one per text: the whole Spanish catalog has over two thousand texts, and the
 * per-text scan took seconds on a loaded machine.
 */
function findAll(
  texts: ReadonlyArray<readonly [string, string]>,
  patterns: ReadonlyArray<readonly [RegExp, string]>,
): Array<{ at: string; found: string; use: string }> {
  const joined = texts.map(([, text]) => text).join('\n');
  return patterns.flatMap(([pattern, use]) =>
    !new RegExp(pattern.source, pattern.flags.replace('g', '')).test(joined)
      ? []
      : texts.flatMap(([at, text]) => [...text.matchAll(pattern)].map((match) => ({ at, found: match[0], use }))),
  );
}
const lessonTexts = (): Array<readonly [string, string]> =>
  spanish.flatMap(({ id, strings }) => strings.map((value) => [id, value] as const));

describe('LRN-029 every lesson and hint exists in English and Spanish with the same structure', () => {
  it(
    'LRN-029 every lesson package has a valid English and a valid Spanish text, with the same stages, hint levels, counts and quoted ' +
      'facts',
    () => {
      expect(problems).toEqual([]);
      expect(packages.length).toBeGreaterThanOrEqual(28);
      for (const lesson of packages) {
        expect({ id: lesson.id, hints: lesson.texts.es.hints.map((hint) => hint.level) }).toEqual({
          id: lesson.id,
          hints: lesson.texts.en.hints.map((hint) => hint.level),
        });
        expect({ id: lesson.id, shape: textShape(lesson.texts.es) }).toEqual({ id: lesson.id, shape: textShape(lesson.texts.en) });
      }
    },
  );
});

describe('LRN-029 the Spanish lessons are in the register of decision D-10 and use the Learn glossary', () => {
  it('LRN-029 no Spanish lesson or hint addresses the learner with "tú" or voseo', () => {
    expect(findAll(lessonTexts(), [[REGISTER, 'usted or an impersonal form']])).toEqual([]);
  });

  it('LRN-029 no Spanish lesson or hint uses a known wrong variant of a glossary term', () => {
    expect(findAll(lessonTexts(), WRONG_VARIANTS)).toEqual([]);
  });

  it('LRN-029 the Spanish of the Learn panel, the Lab, the plants and the faceplate uses the same register and glossary', () => {
    const catalogs = {
      learn: learnEs,
      learnHome: learnHomeEs,
      lab: labEs,
      labScene: labSceneEs,
      faceplate: faceplateEs,
      interlock: interlockEs,
    };
    const texts = Object.entries(catalogs).flatMap(([catalog, messages]) =>
      Object.entries(messages).map(([key, value]) => [`${catalog} ${key}`, value] as const),
    );
    expect(findAll(texts, [[REGISTER, 'usted or an impersonal form'], ...WRONG_VARIANTS])).toEqual([]);
  });

  it('UX-030 the Spanish of the whole application uses the glossary terms of the course', () => {
    // A {placeholder} is a name in code, not Spanish: `{rung}` is not the word "rung".
    expect(
      findAll(
        Object.entries(es).map(([key, value]) => [key, value.replace(/\{\w+\}/g, '0')] as const),
        WRONG_VARIANTS,
      ),
    ).toEqual([]);
  });

  it('LRN-029 the deny-lists catch the forms they name and leave the usted forms and the code tokens alone', () => {
    expect('Llámelo en cada ciclo; ScanSnapshot y MotorInterlock son nombres.'.match(REGISTER)).toBeNull();
    expect([...'Si tú quieres, llamalo y recién después guardá.'.matchAll(REGISTER)].map((match) => match[0])).toEqual([
      'tú',
      'quieres',
      'llamalo',
      'recién después',
    ]);
    const variants = (text: string) => WRONG_VARIANTS.flatMap(([pattern]) => [...text.matchAll(pattern)].map((match) => match[0]));
    expect(variants('El ciclo de scan del starter, un rung en Ladder y un fallo.')).toEqual([
      'ciclo de scan',
      'rung',
      'fallo',
      'starter',
      'Ladder',
    ]);
    expect(
      variants(
        'Un ciclo de escaneo, un peldaño en diagrama de escalera (LD) y una falla del programa inicial; src/ScanSnapshot.st ' +
          'y tests/scan-snapshot.scenario.json.',
      ),
    ).toEqual([]);
    expect(variants('La copia queda demorada un scan.')).toEqual(['scan']);
  });
});

/** The forms the register and the glossary refuse in one Spanish string, with its {placeholders} taken out. */
const refused = (value: string): string[] => {
  const bare = value.replace(/\{\w+\}/g, '0');
  return [...[...bare.matchAll(REGISTER)], ...WRONG_VARIANTS.flatMap(([pattern]) => [...bare.matchAll(pattern)])].map((match) => match[0]);
};
const placeholdersOf = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

/** The structure of a Markdown page: its heading levels in order and how many list items, table rows and images it has. */
function pageShape(markdown: string): { headings: string; listItems: number; tableRows: number; images: number } {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '');
  return {
    headings: (body.match(/^#{1,6} /gm) ?? []).map((heading) => heading.trim()).join(' '),
    listItems: (body.match(/^\s*(?:[-*]|\d+\.) /gm) ?? []).length,
    tableRows: (body.match(/^\|.*\|\s*$/gm) ?? []).length,
    images: (body.match(/!\[/g) ?? []).length,
  };
}
const markdownFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : name.endsWith('.md') ? [path] : [];
  });
const DOCS = join(import.meta.dir, '../../../../docs');
const KIT_PAGES = {
  en: join(DOCS, 'docs/reference/learner-kits'),
  es: join(DOCS, 'i18n/es/docusaurus-plugin-content-docs/current/reference/learner-kits'),
};

describe('LRN-029 every wiring phrase, kit text and wiring page exists in English and Spanish with the same structure', () => {
  it('LRN-029 every wiring phrase has a Spanish text with the same placeholders, in the register and the terms of the glossary', () => {
    expect(Object.keys(phrases.es).sort()).toEqual(Object.keys(phrases.en).sort());
    for (const key of Object.keys(phrases.en) as Array<keyof typeof phrases.en>) {
      const spanish = phrases.es[key];
      expect({ key, empty: spanish.trim() === '', placeholders: placeholdersOf(spanish), refused: refused(spanish) }).toEqual({
        key,
        empty: false,
        placeholders: placeholdersOf(phrases.en[key]),
        refused: [],
      });
    }
  });

  it(
    'LRN-029 every part of the kit and every sentence of the voltage limit exists in both languages, in the register and the terms of ' +
      'the glossary',
    () => {
      expect(kit.voltageLimit.es.length).toBe(kit.voltageLimit.en.length);
      for (const sentence of kit.voltageLimit.es) expect({ sentence, refused: refused(sentence) }).toEqual({ sentence, refused: [] });
      for (const item of kit.bom as Array<{ id: string; name: { en: string; es: string }; note?: { en: string; es: string } }>) {
        expect({
          id: item.id,
          name: item.name.es.trim() !== '',
          note: item.note === undefined || (item.note.en.trim() !== '' && item.note.es.trim() !== ''),
        }).toEqual({ id: item.id, name: true, note: true });
        for (const text of [item.name.es, item.note?.es ?? ''])
          expect({ id: item.id, refused: refused(text) }).toEqual({ id: item.id, refused: [] });
      }
    },
  );

  it('LRN-029 every learner-kit and wiring page has a Spanish page with the same headings, list items, table rows and diagrams', () => {
    const english = markdownFiles(KIT_PAGES.en)
      .map((file) => relative(KIT_PAGES.en, file))
      .sort();
    expect(english.length).toBeGreaterThan(10);
    expect(
      markdownFiles(KIT_PAGES.es)
        .map((file) => relative(KIT_PAGES.es, file))
        .sort(),
    ).toEqual(english);
    for (const page of english) {
      expect({ page, shape: pageShape(readFileSync(join(KIT_PAGES.es, page), 'utf8')) }).toEqual({
        page,
        shape: pageShape(readFileSync(join(KIT_PAGES.en, page), 'utf8')),
      });
    }
  });

  it('LRN-029 every Spanish board text of a learner board is in the register and the terms of the glossary', () => {
    const twins = BOARD_TEXTS.filter((text) => text.spanish !== undefined);
    expect(twins.length).toBeGreaterThan(40);
    for (const { at, spanish } of twins) expect({ at, refused: refused(spanish!) }).toEqual({ at, refused: [] });
  });

  it(
    'LRN-029 no Spanish learner-kit page, wiring page, wiring diagram or board reference section shows the English note of a learner ' +
      'board',
    () => {
      const svgs = (directory: string): string[] =>
        readdirSync(directory).flatMap((name) => {
          const path = join(directory, name);
          return statSync(path).isDirectory() ? svgs(path) : name.endsWith('.es.svg') ? [path] : [];
        });
      const unescape = (text: string) =>
        text
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');
      const reference = readFileSync(join(DOCS, 'i18n/es/docusaurus-plugin-content-docs/current/reference/boards.md'), 'utf8').split(
        /^### /m,
      );
      const pages = [
        ...markdownFiles(KIT_PAGES.es).map((file) => [relative(DOCS, file), readFileSync(file, 'utf8')] as const),
        ...svgs(join(DOCS, 'static/img/wiring')).map((file) => [relative(DOCS, file), unescape(readFileSync(file, 'utf8'))] as const),
        ...LEARNER_BOARDS.map(
          (board) =>
            [
              `reference/boards.md ${board.display_name}`,
              reference.find((block) => block.startsWith(`${board.display_name}\n`)) ?? '',
            ] as const,
        ),
      ];
      expect(pages.length).toBeGreaterThan(40);
      const english = BOARD_TEXTS.filter((text) => text.english !== text.spanish);
      const shown = pages.flatMap(([page, body]) =>
        english.filter((text) => body.includes(text.english)).map((text) => ({ page, at: text.at, english: text.english })),
      );
      expect(shown).toEqual([]);
    },
  );
});

/** The learner boards of boards.json: the boards whose human text has a Spanish twin under the same key with `_es`. */
type BoardItem = Record<string, unknown>;
const LEARNER_BOARDS = (
  boardManifest as unknown as Array<{
    board_id: string;
    display_name: string;
    learner?: boolean;
    io: { channels: BoardItem[]; unmapped: BoardItem[] };
    fieldbus?: BoardItem[];
  }>
).filter((board) => board.learner === true);
/** Each English text of a learner board a Spanish page shows in Spanish, with its twin; a required text always counts. */
const BOARD_TEXTS = LEARNER_BOARDS.flatMap((board) =>
  [...board.io.channels, ...board.io.unmapped, ...(board.fieldbus ?? [])].flatMap((item) =>
    (['pin', 'location', 'electrical', 'scaling', 'terminal', 'reason'] as const)
      .filter(
        (key) =>
          typeof item[key] === 'string' &&
          (typeof item[`${key}_es`] === 'string' || ['location', 'electrical', 'scaling', 'reason'].includes(key)),
      )
      .map((key) => ({
        at: `${board.board_id} ${String(item.id ?? item.terminal)} ${key}`,
        english: item[key] as string,
        spanish: item[`${key}_es`] as string | undefined,
      })),
  ),
);

describe('LRN-012 the first lesson leads to a blink with the controls Studio shows', () => {
  it(
    'LRN-012 the Run stage of the first lesson names Build, Compile, Connect, Run, Watch and Check by their labels, in English and in ' +
      'Spanish',
    () => {
      const first = packages.find((lesson) => lesson.id === 'first-blink-simulation')!;
      for (const locale of ['en', 'es'] as const) {
        const { t } = translatorFor(locale);
        const run = expandText(first.texts[locale], first.scenario).text.stages.find((stage) => stage.key === 'run')!;
        const labels = [
          t('toolbar.build.text'),
          t('toolbar.compile.text'),
          t('toolbar.connect'),
          `${t('toolbar.run.label')} (F5)`,
          t('panel.watch'),
          t('learn.check'),
        ];
        expect({ locale, missing: labels.filter((label) => !run.body.includes(label)) }).toEqual({ locale, missing: [] });
      }
    },
  );
});

describe('LRN-029 every plant label exists in English and Spanish', () => {
  it('LRN-029 every plant.* label has a Spanish text with the same placeholders, and the Spanish catalog serves it', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const plantKeys = (Object.keys(labEn) as Array<keyof typeof labEn>).filter((key) => key.startsWith('plant.'));
    expect(plantKeys.length).toBeGreaterThan(40);
    expect(
      Object.keys(labEs)
        .filter((key) => key.startsWith('plant.'))
        .sort(),
    ).toEqual([...plantKeys].sort());
    const es = translatorFor('es');
    for (const key of plantKeys) {
      expect({ key, empty: labEs[key].trim() === '', placeholders: placeholders(labEs[key]) }).toEqual({
        key,
        empty: false,
        placeholders: placeholders(labEn[key]),
      });
      expect({ key, served: es.t(key) }).toEqual({ key, served: labEs[key] });
    }
  });
});
