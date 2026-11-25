/**
 * The one vocabulary of the interface (MSG-001), in English and in Spanish, defined once (plan-u2.md, C-V). Task X0b holds
 * the data and the types; task V1 fills `IMPLEMENTATION_TERMS`, `MAIN_PATH_PREFIXES` and the three formatters, and the i18n
 * guard reads them per surface.
 */
export type ConceptId =
  'project' | 'simulation' | 'board' | 'target' | 'build' | 'deploy' | 'test' | 'check' | 'plant' | 'resultSimulation' | 'resultBoard';

export interface VocabularyRow {
  en: string;
  es: string;
  /** The words this concept replaces in the interface; the file format keeps its own names (a test file is a "scenario"). */
  replaces: readonly string[];
}

export const VOCABULARY: Record<ConceptId, VocabularyRow> = {
  project: { en: 'Project', es: 'Proyecto', replaces: ['workspace', 'saved workspace'] },
  simulation: {
    en: 'Simulation',
    es: 'Simulación',
    replaces: ['simulator session', 'native runtime', 'host', 'Local POSIX'],
  },
  board: { en: 'Board', es: 'Placa', replaces: ['hardware', 'device', 'controller'] },
  target: { en: 'Target', es: 'Destino', replaces: ['mode'] },
  build: { en: 'Build', es: 'Compilar', replaces: ['compile', 'canonical build'] },
  deploy: { en: 'Deploy', es: 'Desplegar', replaces: ['upload', 'load'] },
  test: { en: 'Test', es: 'Prueba', replaces: ['scenario', 'host scenario', 'workspace test'] },
  check: { en: 'Check', es: 'Comprobar', replaces: ['scenario verified', 'lesson evidence'] },
  plant: { en: 'Plant', es: 'Planta', replaces: ['lab'] },
  resultSimulation: {
    en: 'Simulation result',
    es: 'Resultado en simulación',
    replaces: ['host evidence only', 'not hardware or HIL evidence'],
  },
  resultBoard: { en: 'Board result', es: 'Resultado en placa', replaces: [] },
};

/**
 * MSG-002's list, as word patterns in both languages (case-insensitive; the guard adds the word boundaries, which a plain
 * `\b` cannot do next to an accented letter). These terms stay allowed on a Details, Inspector, Terminal or detailed-Output key.
 */
export const IMPLEMENTATION_TERMS: readonly string[] = [
  'posix',
  'native|nativo|nativa',
  'host|anfitrión',
  'canonical|canónic[oa]',
  'workspace|espacio de trabajo',
  'link|vincul\\p{L}*|enlace',
  'adapter|adaptador',
  'artifact|artefacto',
  'bytecode|código de bytes',
  'sha-256',
  'vm|máquina virtual',
];
/** The catalog key prefixes of the main-path surfaces: the command bar, the status rail, notices, the verdict of a test or check. */
export const MAIN_PATH_PREFIXES: readonly string[] = [
  'toolbar.',
  'toolbarMsg.',
  'status.',
  'statusText.',
  'studio.status',
  'studio.flow',
  'studio.notice',
  'notice.',
  'notices.',
  'console.tests',
  'console.runHostScenarios',
  'console.runningHost',
  'console.tab.',
  'connection.simulation.',
  'u2Tests.',
  'learn.grade.',
  'learn.check',
  'learn.failedAssertions',
  'learn.lessonEvidence',
];
/** A key with one of these segments is a Details, Inspector or Terminal surface and may hold an implementation term. */
export const DETAIL_SEGMENTS: readonly string[] = ['.details.', '.inspector.', '.terminal.', '.detail.'];

/** MSG-006 formatters. */
export type FormatHash = (sha256: string) => string;
export type FormatSize = (bytes: number, locale: string) => string;
export type FormatTime = (value: number | Date, locale: string) => string;

/** The first 8 hexadecimal digits and an ellipsis; the full value belongs to a copy action. */
export const formatHash: FormatHash = (sha256) => `${sha256.slice(0, 8)}…`;

/** A size with its unit: "302 bytes", "1.2 KB" (1024-based, one decimal, the number in the locale). */
export const formatSize: FormatSize = (bytes, locale) => {
  if (bytes < 1024) return `${new Intl.NumberFormat(locale).format(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
};

/** A date is shown in the locale; a number is a duration in ms: "250 ms", "1.5 s". */
export const formatTime: FormatTime = (value, locale) => {
  if (value instanceof Date) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  if (Math.abs(value) < 1000) return `${new Intl.NumberFormat(locale).format(value)} ms`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000)} s`;
};
