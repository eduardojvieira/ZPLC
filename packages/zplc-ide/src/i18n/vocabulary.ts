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

/** MSG-002's list, as word-boundary patterns in both languages. Filled by task V1. */
export const IMPLEMENTATION_TERMS: readonly string[] = [];
/** The catalog key prefixes of the main-path surfaces. Filled by task V1. */
export const MAIN_PATH_PREFIXES: readonly string[] = [];

/** MSG-006 formatters; task V1 implements them with these signatures. */
export type FormatHash = (sha256: string) => string;
export type FormatSize = (bytes: number, locale: string) => string;
export type FormatTime = (value: number | Date, locale: string) => string;
