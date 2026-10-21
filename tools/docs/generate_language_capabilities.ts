// The capability table of the five languages, produced from named journeys and not written by hand (LNG-001, LNG-027).
//
//   bun tools/docs/generate_language_capabilities.ts           write the table into the Languages page, in both languages
//   bun tools/docs/generate_language_capabilities.ts --check   exit 1 when the pages are stale or a cell names a journey
//                                                              that does not exist
//
// The source is tools/docs/language-capabilities.json: for each language and capability the one journey of the ZPLC
// application that shows it, end to end, in a real window. A cell is refused when it is empty, or names a unit test, a
// conformance case or "board only": those prove a leg, not what a person does. A cell never says "works" by itself: it names
// the check, the check must exist (this script) and pass (the CI job that runs the journeys). Deploy is shown by a journey
// that clicks Deploy against the native runtime behind the shell of an emulated board (packages/zplc-ide/scripts/emulatedDevice.ts);
// no physical board is involved, and the hardware evidence page lists what a person ran on one.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LANG_DIR, LANGS, ROOT, markerBegin, markerEnd, table as markdownTable, type L10n, type Lang } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_language_capabilities.ts';
const BLOCK = 'language-capabilities';
const SOURCE = 'tools/docs/language-capabilities.json';
const JOURNEYS = 'packages/zplc-ide/scripts/journeys.ts';

/** The only kind of check a cell may name; the others are read from the file so that they can be refused by name. */
export type Cell = { kind: 'journey'; ref: string } | { kind: string; ref?: string } | null;
export interface CapabilityTable {
  capabilities: string[];
  languages: Record<string, Record<string, Cell>>;
}

export const LANGUAGES = ['st', 'il', 'ld', 'fbd', 'sfc'] as const;
export const CAPABILITIES = ['edit', 'build', 'simulate', 'debug', 'pause', 'watch', 'force', 'deploy'] as const;

const LANGUAGE_NAME: Record<(typeof LANGUAGES)[number], L10n> = {
  st: { en: 'Structured Text', es: 'Texto estructurado' },
  il: { en: 'Instruction List', es: 'Lista de instrucciones' },
  ld: { en: 'Ladder Diagram', es: 'Diagrama de escalera' },
  fbd: { en: 'Function Block Diagram', es: 'Diagrama de bloques de función' },
  sfc: { en: 'Sequential Function Chart', es: 'Diagrama funcional secuencial' },
};
const CAPABILITY_NAME: Record<(typeof CAPABILITIES)[number], L10n> = {
  edit: { en: 'Edit', es: 'Editar' },
  build: { en: 'Build', es: 'Compilar' },
  simulate: { en: 'Simulate', es: 'Simular' },
  debug: { en: 'Debug (breakpoint)', es: 'Depurar (punto de interrupción)' },
  pause: { en: 'Pause, step one cycle, resume', es: 'Pausar, avanzar un ciclo, reanudar' },
  watch: { en: 'Watch online values', es: 'Observar valores en línea' },
  force: { en: 'Force', es: 'Forzar' },
  deploy: { en: 'Deploy (click Deploy and confirm)', es: 'Cargar (pulsar Cargar y confirmar)' },
};
const JOURNEY: L10n = {
  en: 'ZPLC application journey in the native simulation',
  es: 'Recorrido de la aplicación ZPLC en la simulación nativa',
};
const DEPLOY_JOURNEY: L10n = {
  en: 'ZPLC application journey: Deploy clicked against an emulated board',
  es: 'Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada',
};

export function loadTable(root = ROOT): CapabilityTable {
  return JSON.parse(readFileSync(join(root, SOURCE), 'utf8')) as CapabilityTable;
}

/** The cells that name no journey, or one that does not exist, as messages. */
export function unresolved(source: CapabilityTable, root = ROOT): string[] {
  const journeys = readFileSync(join(root, JOURNEYS), 'utf8');
  const problems: string[] = [];
  for (const language of LANGUAGES) {
    for (const capability of CAPABILITIES) {
      const cell = source.languages[language]?.[capability];
      const where = `${language}/${capability}`;
      if (cell === undefined) problems.push(`${where}: no entry`);
      else if (cell === null) problems.push(`${where}: no check; a cell must name an end-to-end journey`);
      else if (cell.kind !== 'journey' || typeof cell.ref !== 'string')
        problems.push(`${where}: a '${cell.kind}' check is not end to end; a cell must name a journey of the ZPLC application`);
      else if (!journeys.includes(`name: '${cell.ref}'`)) problems.push(`${where}: no journey named '${cell.ref}'`);
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
      const cell = source.languages[language]![capability] as { ref: string };
      const evidence = capability === 'deploy' ? DEPLOY_JOURNEY[lang] : JOURNEY[lang];
      return [LANGUAGE_NAME[language][lang], CAPABILITY_NAME[capability][lang], evidence, `\`${cell.ref}\``.replace(/\|/g, '\\|')];
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
  for (const { file, content } of stale) {
    writeFileSync(join(ROOT, file), content);
    console.log(`Wrote ${file}`);
  }
}
