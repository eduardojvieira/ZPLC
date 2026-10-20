// The capability table of the five languages, produced from named tests and not written by hand (LNG-001, LNG-027).
//
//   bun tools/docs/generate_language_capabilities.ts           write the table into the Languages page, in both languages
//   bun tools/docs/generate_language_capabilities.ts --check   exit 1 when the pages are stale or a cell names a test that does not exist
//
// The source is tools/docs/language-capabilities.json: for each language and capability the one journey, test or
// conformance case that shows it, or null when no end-to-end test shows it yet, or "board" when only a person with a board
// can show it. A cell never says "works" by itself: it names the check, and the check must exist (this script) and pass
// (the CI job that runs it: the IDE journeys, the IDE unit suite, the conformance runner). A language whose cell is empty
// stays visibly empty until a test fills it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LANG_DIR, LANGS, ROOT, markerBegin, markerEnd, prose, table as markdownTable, type L10n, type Lang } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_language_capabilities.ts';
const BLOCK = 'language-capabilities';
const SOURCE = 'tools/docs/language-capabilities.json';
const JOURNEYS = 'packages/zplc-ide/scripts/journeys.ts';

export type Cell =
  | { kind: 'journey'; ref: string }
  | { kind: 'test'; ref: string; contains: string }
  | { kind: 'conformance'; ref: string }
  | { kind: 'board' }
  | null;
export interface CapabilityTable { capabilities: string[]; languages: Record<string, Record<string, Cell>> }

export const LANGUAGES = ['st', 'il', 'ld', 'fbd', 'sfc'] as const;
export const CAPABILITIES = ['edit', 'build', 'simulate', 'debug', 'watch', 'force', 'deploy'] as const;

const LANGUAGE_NAME: Record<(typeof LANGUAGES)[number], L10n> = {
  st: { en: 'Structured Text', es: 'Texto Estructurado' },
  il: { en: 'Instruction List', es: 'Lista de Instrucciones' },
  ld: { en: 'Ladder Diagram', es: 'Diagrama de Escalera' },
  fbd: { en: 'Function Block Diagram', es: 'Diagrama de Bloques de Función' },
  sfc: { en: 'Sequential Function Chart', es: 'Diagrama Funcional Secuencial' },
};
const CAPABILITY_NAME: Record<(typeof CAPABILITIES)[number], L10n> = {
  edit: { en: 'Edit', es: 'Editar' },
  build: { en: 'Build', es: 'Compilar' },
  simulate: { en: 'Simulate', es: 'Simular' },
  debug: { en: 'Debug (breakpoint, pause, step)', es: 'Depurar (punto de parada, pausa, paso)' },
  watch: { en: 'Watch online values', es: 'Observar valores en línea' },
  force: { en: 'Force', es: 'Forzar' },
  deploy: { en: 'Deploy to a board', es: 'Cargar en una placa' },
};
const KIND: Record<'journey' | 'test' | 'conformance', L10n> = {
  journey: { en: 'ZPLC application journey in the native simulation', es: 'Recorrido de la aplicación ZPLC en la simulación nativa' },
  test: { en: 'Test on the native runtime', es: 'Prueba en el runtime nativo' },
  conformance: { en: 'Conformance case on the host runtime', es: 'Caso de conformidad en el runtime del equipo' },
};
const NONE: L10n = { en: 'Not tested end to end yet', es: 'Aún sin prueba de extremo a extremo' };
const BOARD: L10n = { en: 'Board only', es: 'Solo en una placa' };
const BOARD_SOURCE: L10n = {
  en: 'A person deploys and runs it on a board; the hardware evidence page lists the records',
  es: 'Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros',
};

export function loadTable(root = ROOT): CapabilityTable {
  return JSON.parse(readFileSync(join(root, SOURCE), 'utf8')) as CapabilityTable;
}

/** The cells that name a check which does not exist, as messages. */
export function unresolved(source: CapabilityTable, root = ROOT): string[] {
  const journeys = readFileSync(join(root, JOURNEYS), 'utf8');
  const problems: string[] = [];
  for (const language of LANGUAGES) {
    for (const capability of CAPABILITIES) {
      const cell = source.languages[language]?.[capability];
      const where = `${language}/${capability}`;
      if (cell === undefined) problems.push(`${where}: no entry (use null for a gap)`);
      else if (cell === null || cell.kind === 'board') continue;
      else if (cell.kind === 'journey' && !journeys.includes(`name: '${cell.ref}'`)) problems.push(`${where}: no journey named '${cell.ref}'`);
      else if (cell.kind === 'conformance' && !existsSync(join(root, 'conformance', `${cell.ref}.expect.json`))) problems.push(`${where}: no conformance case ${cell.ref}`);
      else if (cell.kind === 'test' && !(existsSync(join(root, cell.ref)) && readFileSync(join(root, cell.ref), 'utf8').includes(cell.contains))) problems.push(`${where}: ${cell.ref} has no '${cell.contains}'`);
    }
  }
  return problems;
}

const HEAD: Record<Lang, string[]> = {
  en: ['Language', 'Capability', 'Evidence', 'Check that shows it'],
  es: ['Lenguaje', 'Capacidad', 'Evidencia', 'Prueba que lo muestra'],
};

export function capabilityBlock(lang: Lang, source = loadTable()): string {
  const rows = LANGUAGES.flatMap((language) =>
    CAPABILITIES.map((capability) => {
      const cell = source.languages[language]![capability] ?? null;
      const evidence = cell === null ? NONE[lang] : cell.kind === 'board' ? BOARD[lang] : KIND[cell.kind][lang];
      const check = cell === null ? '' : cell.kind === 'board' ? BOARD_SOURCE[lang] : cell.kind === 'journey' ? `\`${cell.ref}\`` : cell.kind === 'test' ? `\`${cell.contains}\`` : `\`${cell.ref.split('/').pop()}\``;
      return [LANGUAGE_NAME[language][lang], CAPABILITY_NAME[capability][lang], evidence, cell !== null && cell.kind !== 'board' ? check.replace(/\|/g, '\\|') : prose(check)];
    }),
  );
  return markdownTable(HEAD[lang], rows);
}

/** The Languages page of each language with the block between its markers replaced. */
export function outputs(root = ROOT): Array<{ file: string; content: string }> {
  const begin = markerBegin(GENERATOR, BLOCK);
  const end = markerEnd(BLOCK);
  return LANGS.map((lang) => {
    const file = join(LANG_DIR[lang], 'languages/index.md');
    const text = readFileSync(join(root, file), 'utf8');
    const from = text.indexOf(begin);
    const to = text.indexOf(end);
    if (from < 0 || to < from) throw new Error(`${file} has no ${BLOCK} markers`);
    return { file, content: `${text.slice(0, from + begin.length)}\n\n${capabilityBlock(lang)}\n\n${text.slice(to)}` };
  });
}

if (import.meta.main) {
  const problems = unresolved(loadTable());
  for (const problem of problems) console.error(`ERROR: ${problem}`);
  const stale = outputs().filter(({ file, content }) => readFileSync(join(ROOT, file), 'utf8') !== content);
  if (process.argv.includes('--check')) {
    for (const { file } of stale) console.error(`ERROR: stale generated block in ${file}; run bun ${GENERATOR}`);
    process.exit(problems.length + stale.length > 0 ? 1 : 0);
  }
  if (problems.length > 0) process.exit(1);
  for (const { file, content } of stale) { writeFileSync(join(ROOT, file), content); console.log(`Wrote ${file}`); }
}
