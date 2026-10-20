// The language reference, one page per language, generated from the conformance matrix (DOC-006).
//
//   bun tools/docs/generate_language_reference.ts           write docs/docs/reference/language-{st,il,ld,fbd,sfc}.md and the Spanish twins
//   bun tools/docs/generate_language_reference.ts --check   exit 1 when a page is stale, when a row of the matrix is on no page,
//                                                           or when a row has no Spanish title in docs/language-element-titles.es.json
//
// What an element does is not written by hand and not taken from the spec's table of the state before the work: it is read off the
// executed tests. A row of conformance/matrix.json is "works" only when a conformance case that names it is not on the
// expected-failures list (tools/ci/expected-failures.json), and CI runs every case and fails on one that fails and is not listed
// (the same rule that tools/ci/conformance-coverage.ts applies). A row that is rejected on purpose needs a negative case that
// asserts the diagnostic, and the "not supported" list of each page is made of the rows that do not work.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MEMORY_REGION } from '../../packages/zplc-compiler/src/contract.generated.ts';
import { loadCases } from '../../packages/zplc-ide/src/conformance/cases';
import { RUNNER, factsOf, needOf, type CaseFacts, type Gap } from '../ci/conformance-coverage';
import type { Matrix, MatrixRow } from '../ci/generate-conformance-matrix';
import { code, outputsOf, ROOT, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_language_reference.ts';
const TITLES_ES = 'docs/language-element-titles.es.json';

export type State = 'works' | 'partial' | 'broken' | 'unverified' | 'rejected' | 'decision';

export interface RowFacts {
  row: MatrixRow;
  state: State;
  /** Executed cases that count (they pass, or must not build and do not). */
  passing: number;
  /** Cases of the kind the row needs that are on the expected-failures list. */
  failing: number;
  gap?: Gap;
}

/** The state of one row, from the cases that name it. Pure: the callers read the files. */
export function rowFacts(row: MatrixRow, cases: CaseFacts[], listed: string[], gaps: Gap[]): RowFacts {
  const kind = needOf(row) === 'passing' ? 'succeeds' : 'fails';
  const own = cases.filter((found) => found.matrix.includes(row.id) && found.build === kind);
  const failing = own.filter((found) => listed.includes(`${RUNNER} > conformance > ${found.name}`)).length;
  const passing = own.length - failing;
  const gap = gaps.find((entry) => entry.row === row.id);
  let state: State;
  if (row.target === 'works') state = passing > 0 ? (failing > 0 ? 'partial' : 'works') : failing > 0 ? 'broken' : 'unverified';
  else if (passing > 0) state = row.target === 'decision' ? 'decision' : 'rejected';
  else state = 'unverified';
  return { row, state, passing, failing, ...(gap ? { gap } : {}) };
}

// ---------------------------------------------------------------------------
// Which row is on which page
// ---------------------------------------------------------------------------

const SHARED_GRAPHICAL = ['ld-fbd.en-eno', 'ld-fbd.user-blocks-and-functions'];

export const LANGUAGES = ['st', 'il', 'ld', 'fbd', 'sfc'] as const;
export type Language = (typeof LANGUAGES)[number];

const ST_AREAS = ['data-types', 'literals', 'declarations', 'pous', 'statements', 'functions', 'blocks', 'configuration'];

/** Whether a row belongs on the page of a language. A row may be on several pages. */
export function onPage(language: Language, row: MatrixRow): boolean {
  switch (language) {
    case 'st': return ST_AREAS.includes(row.area);
    case 'il': return row.area === 'il';
    case 'sfc': return row.area === 'sfc';
    case 'ld': return row.id.startsWith('ld-fbd.ld-') || SHARED_GRAPHICAL.includes(row.id);
    case 'fbd': return row.id.startsWith('ld-fbd.fbd-') || SHARED_GRAPHICAL.includes(row.id);
  }
}

const AREA_TITLE: Record<string, L10n> = {
  'data-types': { en: 'Data types', es: 'Tipos de datos' },
  literals: { en: 'Literals', es: 'Literales' },
  declarations: { en: 'Declarations and variables', es: 'Declaraciones y variables' },
  pous: { en: 'Program organisation units', es: 'Unidades de organización de programa' },
  statements: { en: 'Statements and operators', es: 'Sentencias y operadores' },
  functions: { en: 'Conversions and standard functions', es: 'Conversiones y funciones estándar' },
  blocks: { en: 'Function blocks', es: 'Bloques de función' },
  configuration: { en: 'Tasks and configuration', es: 'Tareas y configuración' },
  sfc: { en: 'Sequential Function Chart', es: 'Diagrama funcional secuencial' },
  il: { en: 'Instruction List', es: 'Lista de instrucciones' },
  'ld-fbd': { en: 'Elements', es: 'Elementos' },
};

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const STATE_LABEL: Record<State, L10n> = {
  works: { en: 'Works', es: 'Funciona' },
  partial: { en: 'Partly works', es: 'Funciona en parte' },
  broken: { en: 'Does not work yet', es: 'Aún no funciona' },
  unverified: { en: 'Not verified', es: 'Sin verificar' },
  rejected: { en: 'Rejected with a message', es: 'Se rechaza con un mensaje' },
  decision: { en: 'Rejected with a message, decision open', es: 'Se rechaza con un mensaje, decisión abierta' },
};

const LANGUAGE_TEXT: Record<Language, { title: L10n; label: L10n; description: L10n; editor: L10n; related: Array<{ href: string; text: L10n }> }> = {
  st: {
    title: { en: 'Structured Text (ST) reference', es: 'Referencia de texto estructurado (ST)' },
    label: { en: 'Structured Text', es: 'Texto estructurado' },
    description: { en: 'What of Structured Text works, from the executed conformance tests.', es: 'Qué funciona del texto estructurado, según las pruebas de conformidad ejecutadas.' },
    editor: {
      en: 'Structured Text is written in the primary text editor of ZPLC, which shows the diagnostics of the build with their line and column and navigates from a diagnostic to its source.',
      es: 'El texto estructurado se escribe en el editor de texto principal de ZPLC, que muestra los diagnósticos de la compilación con su línea y columna y navega desde un diagnóstico hasta su código.',
    },
    related: [
      { href: '../languages/st.md', text: { en: 'Structured Text guide', es: 'Guía de texto estructurado' } },
      { href: './functions.md', text: { en: 'Function reference', es: 'Referencia de funciones' } },
      { href: './function-blocks.md', text: { en: 'Function block reference', es: 'Referencia de bloques de función' } },
    ],
  },
  il: {
    title: { en: 'Instruction List (IL) reference', es: 'Referencia de lista de instrucciones (IL)' },
    label: { en: 'Instruction List', es: 'Lista de instrucciones' },
    description: { en: 'What of Instruction List works, from the executed conformance tests.', es: 'Qué funciona de la lista de instrucciones, según las pruebas de conformidad ejecutadas.' },
    editor: {
      en: 'Instruction List is written in a text editor. The source is parsed and translated to Structured Text before it is compiled, so the data types, functions and function blocks are those of Structured Text.',
      es: 'La lista de instrucciones se escribe en un editor de texto. El código se analiza y se traduce a texto estructurado antes de compilarse, por eso los tipos de datos, funciones y bloques de función son los del texto estructurado.',
    },
    related: [
      { href: '../languages/il.md', text: { en: 'Instruction List guide', es: 'Guía de lista de instrucciones' } },
      { href: './language-st.md', text: { en: 'Structured Text reference', es: 'Referencia de texto estructurado' } },
    ],
  },
  ld: {
    title: { en: 'Ladder Diagram (LD) reference', es: 'Referencia de diagrama de escalera (LD)' },
    label: { en: 'Ladder Diagram', es: 'Diagrama de escalera' },
    description: { en: 'What of Ladder Diagram works, from the executed conformance tests.', es: 'Qué funciona del diagrama de escalera, según las pruebas de conformidad ejecutadas.' },
    editor: {
      en: 'Ladder Diagram is drawn in the rung editor of ZPLC: contacts, coils, branches and blocks, with undo and validation while you draw. The Structured Text that the build generates from the rungs is read-only output.',
      es: 'El diagrama de escalera se dibuja en el editor de peldaños de ZPLC: contactos, bobinas, ramas y bloques, con deshacer y validación mientras se dibuja. El texto estructurado que la compilación genera a partir de los peldaños es solo una salida de lectura.',
    },
    related: [
      { href: '../ide/editors.md', text: { en: 'Text and visual editors', es: 'Editores de texto y visuales' } },
      { href: './language-fbd.md', text: { en: 'Function Block Diagram reference', es: 'Referencia de diagrama de bloques de función' } },
      { href: './function-blocks.md', text: { en: 'Function block reference', es: 'Referencia de bloques de función' } },
    ],
  },
  fbd: {
    title: { en: 'Function Block Diagram (FBD) reference', es: 'Referencia de diagrama de bloques de función (FBD)' },
    label: { en: 'Function Block Diagram', es: 'Diagrama de bloques de función' },
    description: { en: 'What of Function Block Diagram works, from the executed conformance tests.', es: 'Qué funciona del diagrama de bloques de función, según las pruebas de conformidad ejecutadas.' },
    editor: {
      en: 'Function Block Diagram is drawn in the diagram editor of ZPLC: blocks with typed pins and connections, with undo and validation while you draw. The Structured Text that the build generates from the diagram is read-only output.',
      es: 'El diagrama de bloques de función se dibuja en el editor de diagramas de ZPLC: bloques con pines tipados y conexiones, con deshacer y validación mientras se dibuja. El texto estructurado que la compilación genera a partir del diagrama es solo una salida de lectura.',
    },
    related: [
      { href: '../ide/editors.md', text: { en: 'Text and visual editors', es: 'Editores de texto y visuales' } },
      { href: './language-ld.md', text: { en: 'Ladder Diagram reference', es: 'Referencia de diagrama de escalera' } },
      { href: './functions.md', text: { en: 'Function reference', es: 'Referencia de funciones' } },
      { href: './function-blocks.md', text: { en: 'Function block reference', es: 'Referencia de bloques de función' } },
    ],
  },
  sfc: {
    title: { en: 'Sequential Function Chart (SFC) reference', es: 'Referencia de diagrama funcional secuencial (SFC)' },
    label: { en: 'Sequential Function Chart', es: 'Diagrama funcional secuencial' },
    description: { en: 'What of Sequential Function Chart works, from the executed conformance tests.', es: 'Qué funciona del diagrama funcional secuencial, según las pruebas de conformidad ejecutadas.' },
    editor: {
      en: 'Sequential Function Chart is drawn in the chart editor of ZPLC: steps, transitions and actions, with undo and validation while you draw. The Structured Text that the build generates from the chart is read-only output.',
      es: 'El diagrama funcional secuencial se dibuja en el editor de diagramas de ZPLC: pasos, transiciones y acciones, con deshacer y validación mientras se dibuja. El texto estructurado que la compilación genera a partir del diagrama es solo una salida de lectura.',
    },
    related: [
      { href: '../ide/editors.md', text: { en: 'Text and visual editors', es: 'Editores de texto y visuales' } },
      { href: './language-st.md', text: { en: 'Structured Text reference', es: 'Referencia de texto estructurado' } },
    ],
  },
};

const PAGE_INTRO: L10n = {
  en: 'The status of every element on this page is read off the executed conformance tests, not written by hand: an element works when at least one conformance case that names it builds, runs and holds its expected values, and no case of it is on the list of known failures. CI runs the whole suite on every change. {counts}',
  es: 'El estado de cada elemento de esta página se lee de las pruebas de conformidad ejecutadas, no se escribe a mano: un elemento funciona cuando al menos un caso de conformidad que lo nombra se compila, se ejecuta y cumple sus valores esperados, y ningún caso suyo figura en la lista de fallas conocidas. CI ejecuta toda la batería en cada cambio. {counts}',
};

const HEADINGS: Record<string, L10n> = {
  editor: { en: 'Editor', es: 'Editor' },
  elements: { en: 'Elements', es: 'Elementos' },
  addressing: { en: 'I/O addressing', es: 'Direccionamiento de E/S' },
  unsupported: { en: 'Not supported', es: 'No admitido' },
  related: { en: 'Related pages', es: 'Páginas relacionadas' },
};

/** The image of a language editor and where it lives: captured by `bun run docs:screenshots -- --editors` (DOC-006, DOC-013). */
export const editorImage = (language: Language, lang: Lang): string => `/img/editors/${language}-${lang}.png`;

const EDITOR_SHOT: Record<Language, L10n> = {
  st: { en: 'The Structured Text editor of ZPLC with the Blinky example open, showing the program and its variable declarations', es: 'El editor de texto estructurado de ZPLC con el ejemplo Blinky abierto, que muestra el programa y la declaración de sus variables' },
  il: { en: 'The Instruction List editor of ZPLC with the Blinky example open, showing the program and its variable declarations', es: 'El editor de lista de instrucciones de ZPLC con el ejemplo Blinky abierto, que muestra el programa y la declaración de sus variables' },
  ld: { en: 'The Ladder Diagram editor of ZPLC with the Blinky example open, showing its rungs, contacts and coils', es: 'El editor de diagrama de escalera de ZPLC con el ejemplo Blinky abierto, que muestra sus peldaños, contactos y bobinas' },
  fbd: { en: 'The Function Block Diagram editor of ZPLC with the Blinky example open, showing its blocks and connections', es: 'El editor de diagrama de bloques de función de ZPLC con el ejemplo Blinky abierto, que muestra sus bloques y conexiones' },
  sfc: { en: 'The Sequential Function Chart editor of ZPLC with the Blinky example open, showing its steps and transitions', es: 'El editor de diagrama funcional secuencial de ZPLC con el ejemplo Blinky abierto, que muestra sus pasos y transiciones' },
};

/** What the image shows, for people who cannot see it. */
export const editorAlt = (language: Language, lang: Lang): string => `${EDITOR_SHOT[language][lang]}${lang === 'en' ? ', in English' : ', con la interfaz en español'}`;

const SCREENSHOT: L10n = {
  en: 'The picture is a real screenshot of this editor, captured by automation from the current version of ZPLC with a small example program open.',
  es: 'La imagen es una captura de pantalla real de este editor, tomada de forma automática de la versión actual de ZPLC con un programa de ejemplo pequeño abierto.',
};

const ADDRESSING_INTRO: L10n = {
  en: 'A variable is bound to a place of the process image with `AT`, or with an entry of `io` in the [project file](./project-file.md). An address is written `%`, the area, the size and the position; the short form `%I0.0` is `%IX0.0`, and addresses are not case sensitive. The same addresses are used in every language: Instruction List writes them in its declarations and the graphical languages declare them in the variable table of the program.',
  es: 'Una variable se asocia a un lugar de la imagen de proceso con `AT`, o con una entrada de `io` en el [archivo de proyecto](./project-file.md). Una dirección se escribe `%`, el área, el tamaño y la posición; la forma corta `%I0.0` es `%IX0.0`, y las direcciones no distinguen mayúsculas de minúsculas. Las mismas direcciones se usan en todos los lenguajes: la lista de instrucciones las escribe en sus declaraciones y los lenguajes gráficos las declaran en la tabla de variables del programa.',
};

const ADDRESS_HEAD: Record<Lang, string[]> = {
  en: ['Address', 'Holds', 'Area', 'Byte offset', 'Region base'],
  es: ['Dirección', 'Contiene', 'Área', 'Desplazamiento en bytes', 'Base de la región'],
};

const SIZES: Array<{ letter: string; en: string; es: string; factor: number; form: (area: string) => string }> = [
  { letter: 'X', en: 'one bit', es: 'un bit', factor: 1, form: (area) => `%${area}X<byte>.<bit>` },
  { letter: 'B', en: 'a byte', es: 'un byte', factor: 1, form: (area) => `%${area}B<n>` },
  { letter: 'W', en: 'a 16-bit word', es: 'una palabra de 16 bits', factor: 2, form: (area) => `%${area}W<n>` },
  { letter: 'D', en: 'a 32-bit double word', es: 'una palabra doble de 32 bits', factor: 4, form: (area) => `%${area}D<n>` },
];

const AREAS: Array<{ letter: string; en: string; es: string; region: { base: number; size: number } }> = [
  { letter: 'I', en: 'inputs', es: 'entradas', region: MEMORY_REGION.IPI },
  { letter: 'Q', en: 'outputs', es: 'salidas', region: MEMORY_REGION.OPI },
  { letter: 'M', en: 'memory (work region)', es: 'memoria (región de trabajo)', region: MEMORY_REGION.WORK },
];

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;

export function addressingTable(lang: Lang): string {
  const rows = AREAS.flatMap((area) => SIZES.map((size) => [
    code(size.form(area.letter)),
    size[lang],
    area[lang],
    size.factor === 1 ? (size.letter === 'X' ? '`<byte>`' : '`n`') : `\`${size.factor} * n\``,
    `${code(hex(area.region.base))} (${area.region.size} ${lang === 'en' ? 'bytes' : 'bytes'})`,
  ]));
  return table(ADDRESS_HEAD[lang], rows);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TABLE_HEAD: Record<Lang, string[]> = {
  en: ['Element', 'Status', 'Executed cases', 'Requirement'],
  es: ['Elemento', 'Estado', 'Casos ejecutados', 'Requisito'],
};
const UNSUPPORTED_HEAD: Record<Lang, string[]> = {
  en: ['Element', 'Status', 'What happens', 'Requirement'],
  es: ['Elemento', 'Estado', 'Qué ocurre', 'Requisito'],
};

/** A title written for people: the references to files of the repository that the spec table carries are dropped. */
export function plainTitle(title: string): string {
  return title.replace(/\s*\((?:IDE|packages)\/[^)]*\)/g, '').trim();
}

// A title as a table cell: nothing in it is read as markup (asterisks, angle brackets, braces, pipes, underscores).
export function titleCell(title: string): string {
  return title.replace(/([\\*_<>{}|[\]])/g, '\\$1');
}

export interface Inputs { matrix: Matrix; facts: RowFacts[]; spanishTitles: Record<string, string> }

export function loadInputs(root = ROOT): Inputs {
  const matrix = JSON.parse(readFileSync(join(root, 'conformance/matrix.json'), 'utf8')) as Matrix;
  const cases = loadCases(join(root, 'conformance')).map(factsOf);
  const listed = (JSON.parse(readFileSync(join(root, 'tools/ci/expected-failures.json'), 'utf8')) as Array<{ test: string }>).map((entry) => entry.test);
  const gaps = JSON.parse(readFileSync(join(root, 'conformance/matrix-gaps.json'), 'utf8')) as Gap[];
  const spanishPath = join(root, TITLES_ES);
  const spanishTitles = existsSync(spanishPath) ? (JSON.parse(readFileSync(spanishPath, 'utf8')) as Record<string, string>) : {};
  return { matrix, facts: matrix.rows.map((row) => rowFacts(row, cases, listed, gaps)), spanishTitles };
}

export function inputErrors(inputs: Inputs): string[] {
  const errors: string[] = [];
  for (const { row } of inputs.facts) {
    if (!LANGUAGES.some((language) => onPage(language, row))) errors.push(`the matrix row ${row.id} is on no language page: add its area to ${GENERATOR}`);
    if (!(row.id in inputs.spanishTitles)) errors.push(`the matrix row ${row.id} has no Spanish title in ${TITLES_ES}`);
  }
  for (const id of Object.keys(inputs.spanishTitles)) if (!inputs.facts.some(({ row }) => row.id === id)) errors.push(`${TITLES_ES} names the row ${id}, which is not in conformance/matrix.json`);
  return errors;
}

function evidenceCell(fact: RowFacts, lang: Lang): string {
  if (fact.failing > 0) return lang === 'en' ? `${fact.passing} pass, ${fact.failing} fail` : `${fact.passing} pasan, ${fact.failing} fallan`;
  return String(fact.passing);
}

const NOT_SUPPORTED_NOTE: Record<State, L10n> = {
  works: { en: '', es: '' },
  partial: { en: 'Part of its cases fail today and are on the list of known failures.', es: 'Parte de sus casos fallan hoy y figuran en la lista de fallas conocidas.' },
  broken: { en: 'Its cases fail today and are on the list of known failures.', es: 'Sus casos fallan hoy y figuran en la lista de fallas conocidas.' },
  unverified: { en: 'No conformance case that runs covers it yet, so nothing is claimed about its behaviour.', es: 'Ningún caso de conformidad que se ejecute lo cubre aún, por eso no se afirma nada sobre su comportamiento.' },
  rejected: { en: 'Not supported: the build refuses it with a message that names the position.', es: 'No admitido: la compilación lo rechaza con un mensaje que indica la posición.' },
  decision: { en: 'Not supported: the build refuses it with a message that names the position; whether a later release supports it is an open decision.', es: 'No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta.' },
};

export function languageBody(language: Language, inputs: Inputs, lang: Lang): string {
  const text = LANGUAGE_TEXT[language];
  const facts = inputs.facts.filter(({ row }) => onPage(language, row));
  const counts: L10n = {
    en: `This page covers ${facts.length} elements: ${facts.filter((fact) => fact.state === 'works').length} work, ${facts.filter((fact) => fact.state === 'rejected' || fact.state === 'decision').length} are rejected on purpose and ${facts.filter((fact) => ['partial', 'broken', 'unverified'].includes(fact.state)).length} are not yet proven.`,
    es: `Esta página cubre ${facts.length} elementos: ${facts.filter((fact) => fact.state === 'works').length} funcionan, ${facts.filter((fact) => fact.state === 'rejected' || fact.state === 'decision').length} se rechazan a propósito y ${facts.filter((fact) => ['partial', 'broken', 'unverified'].includes(fact.state)).length} aún no están probados.`,
  };
  const title = (fact: RowFacts) => titleCell(lang === 'es' ? inputs.spanishTitles[fact.row.id] ?? fact.row.title : plainTitle(fact.row.title));
  const requirement = (fact: RowFacts) => fact.row.requirements.join(', ');

  const areas = [...new Set(facts.map((fact) => fact.row.area))];
  const sections = areas.map((area) => {
    const inArea = facts.filter((fact) => fact.row.area === area);
    return [
      ...(areas.length > 1 ? [`### ${AREA_TITLE[area]?.[lang] ?? area}`] : []),
      table(TABLE_HEAD[lang], inArea.map((fact) => [title(fact), STATE_LABEL[fact.state][lang], evidenceCell(fact, lang), requirement(fact)])),
    ].join('\n\n');
  });

  const unsupported = facts.filter((fact) => fact.state !== 'works');
  const none: L10n = { en: 'Every element of this page works.', es: 'Todos los elementos de esta página funcionan.' };
  const lead: L10n = {
    en: 'These elements do not work today. Each is rejected with a located message or is not yet proven; none of them is silently accepted.',
    es: 'Estos elementos no funcionan hoy. Cada uno se rechaza con un mensaje ubicado o aún no está probado; ninguno se acepta en silencio.',
  };
  return [
    PAGE_INTRO[lang].replace('{counts}', counts[lang]),
    `## ${HEADINGS.editor![lang]}`,
    text.editor[lang],
    `![${editorAlt(language, lang)}](${editorImage(language, lang)})`,
    SCREENSHOT[lang],
    `## ${HEADINGS.elements![lang]}`,
    ...sections,
    `## ${HEADINGS.addressing![lang]}`,
    ADDRESSING_INTRO[lang],
    addressingTable(lang),
    `## ${HEADINGS.unsupported![lang]}`,
    ...(unsupported.length === 0
      ? [none[lang]]
      : [lead[lang], table(UNSUPPORTED_HEAD[lang], unsupported.map((fact) => [title(fact), STATE_LABEL[fact.state][lang], NOT_SUPPORTED_NOTE[fact.state][lang], requirement(fact)]))]),
    `## ${HEADINGS.related![lang]}`,
    text.related.map((link) => `- [${link.text[lang]}](${link.href})`).join('\n'),
  ].join('\n\n');
}

export function pagesOf(inputs: Inputs): ReferencePage[] {
  return LANGUAGES.map((language) => ({
    path: `reference/language-${language}.md`,
    title: LANGUAGE_TEXT[language].title,
    label: LANGUAGE_TEXT[language].label,
    description: LANGUAGE_TEXT[language].description,
    body: (lang: Lang) => languageBody(language, inputs, lang),
  }));
}

if (import.meta.main) {
  const inputs = loadInputs();
  const errors = inputErrors(inputs);
  process.exit(runGenerator(GENERATOR, errors.length > 0 ? [] : outputsOf(GENERATOR, pagesOf(inputs)), process.argv.slice(2), errors));
}
