/**
 * What the Welcome screen says about each bundled example (UX-022, review finding M-14), kept apart from the project
 * manifests so that a project can be described, regrouped or hidden without editing it.
 *
 * Rules:
 * - The key is the folder name under projects/. An entry whose folder does not exist (yet) is ignored; a folder with no
 *   entry is listed under "More examples" with its manifest name, so adding a project never makes it vanish.
 * - `languages` are the languages of the programs the manifest's tasks build, and `board` is the manifest's target board
 *   (left out for the host simulator, `posix`). exampleCatalog.test.ts compares both with every manifest on disk.
 * - `showOnWelcome: false` is for test fixtures. The `_starter` folders are not listed here: they belong to the Learn tab.
 * - `level` is a judgement of how many ideas the example needs at once: beginner is one idea and a few inputs, intermediate
 *   is several parts that depend on each other (faults, state, feedback, a board), advanced is the library as a whole.
 * - The order of the entries is the order they are shown in within their group.
 */
import { t } from '../i18n';
import type { MessageKey } from '../i18n/en';
import type { ProjectInfo } from './projectLoader';

export type ExampleLanguage = 'ST' | 'LD' | 'IL' | 'FBD' | 'SFC';
export type ExampleLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExampleGroupId = 'first-steps' | 'motors' | 'process' | 'languages' | 'boards' | 'fixtures' | 'more';

export interface ExampleEntry {
  title: string;
  /** One line that says what the program does, so that a learner can choose without opening it. */
  summary: string;
  group: Exclude<ExampleGroupId, 'more'>;
  level: ExampleLevel;
  languages: readonly ExampleLanguage[];
  /** The board id of the manifest (`rpi_pico`), for examples that need hardware. */
  board?: string;
  /** Set on a hardware example that ships no scenario; its reason is the catalog key `examples.<folder>.noScenario` (LRN-036). */
  noScenario?: true;
  showOnWelcome: boolean;
}

/** The groups of the Welcome screen; their titles and lines are catalog keys, so they follow the language of the interface (UX-022, UX-029). */
export const EXAMPLE_GROUPS: ReadonlyArray<{ id: ExampleGroupId; titleKey: MessageKey; blurbKey: MessageKey | null }> = [
  { id: 'first-steps', titleKey: 'welcome.group.first-steps.title', blurbKey: 'welcome.group.first-steps.blurb' },
  { id: 'motors', titleKey: 'welcome.group.motors.title', blurbKey: 'welcome.group.motors.blurb' },
  { id: 'process', titleKey: 'welcome.group.process.title', blurbKey: 'welcome.group.process.blurb' },
  { id: 'languages', titleKey: 'welcome.group.languages.title', blurbKey: 'welcome.group.languages.blurb' },
  { id: 'boards', titleKey: 'welcome.group.boards.title', blurbKey: 'welcome.group.boards.blurb' },
  { id: 'fixtures', titleKey: 'welcome.group.fixtures.title', blurbKey: null },
  { id: 'more', titleKey: 'welcome.group.more.title', blurbKey: null },
];

export const EXAMPLE_LEVELS: readonly ExampleLevel[] = ['beginner', 'intermediate', 'advanced'];

/** The name of a language, of a level or of a board in the language of the interface. */
export const languageName = (language: ExampleLanguage): string => t(`welcome.language.${language}`);
export const levelName = (level: ExampleLevel): string => t(`welcome.level.${level}`);

const BOARD_KEYS: Readonly<Record<string, MessageKey>> = {
  rpi_pico: 'welcome.board.rpi_pico',
  esp32s3_devkitc: 'welcome.board.esp32s3_devkitc',
  arduino_opta_wifi: 'welcome.board.arduino_opta_wifi',
};

/** The name of a manifest board id; an id the catalogs do not know is shown as written. */
export const boardName = (board: string): string => (board in BOARD_KEYS ? t(BOARD_KEYS[board]!) : board);

/** An entry whose title and summary are the catalog keys `examples.<folder>.title` and `.summary` (src/i18n/catalog/examples.ts), read in the language of the moment. */
const example = (id: string, rest: Omit<ExampleEntry, 'title' | 'summary'>): ExampleEntry => ({
  get title() { return t(`examples.${id}.title` as MessageKey); },
  get summary() { return t(`examples.${id}.summary` as MessageKey); },
  ...rest,
});

export const EXAMPLE_CATALOG: Readonly<Record<string, ExampleEntry>> = {
  // First steps
  first_blink: example('first_blink', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  scan_snapshot: example('scan_snapshot', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  blinky: example('blinky', { group: 'first-steps', level: 'beginner', languages: ['LD'], showOnWelcome: true }),
  edge_counter: example('edge_counter', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  enabled_blink: example('enabled_blink', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  two_hand: example('two_hand', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  alarm_latch: example('alarm_latch', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  delays: example('delays', { group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  seal_in_ladder: example('seal_in_ladder', { group: 'first-steps', level: 'beginner', languages: ['LD'], showOnWelcome: true }),
  batch_count_fbd: example('batch_count_fbd', { group: 'first-steps', level: 'beginner', languages: ['FBD'], showOnWelcome: true }),

  // Motors and drives
  motor_start_stop: example('motor_start_stop', { group: 'motors', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  motor_control: example('motor_control', { group: 'motors', level: 'beginner', languages: ['LD'], showOnWelcome: true }),
  motor_plant: example('motor_plant', { group: 'motors', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  interlock_guard: example('interlock_guard', { group: 'motors', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),

  // Process and sequences
  tank_level: example('tank_level', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  conveyor_01: example('conveyor_01', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  pedestrian_crossing: example('pedestrian_crossing', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  typed_steps: example('typed_steps', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  scaling: example('scaling', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  fill_mix_sfc: example('fill_mix_sfc', { group: 'process', level: 'intermediate', languages: ['SFC'], showOnWelcome: true }),
  pump_pair: example('pump_pair', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),
  call_panel: example('call_panel', { group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true }),

  // Language tour
  blinky_st: example('blinky_st', { group: 'languages', level: 'beginner', languages: ['ST'], showOnWelcome: true }),
  blinky_il: example('blinky_il', { group: 'languages', level: 'beginner', languages: ['IL'], showOnWelcome: true }),
  blinky_fbd: example('blinky_fbd', { group: 'languages', level: 'beginner', languages: ['FBD'], showOnWelcome: true }),
  blinky_sfc: example('blinky_sfc', { group: 'languages', level: 'beginner', languages: ['SFC'], showOnWelcome: true }),

  // Boards and hardware
  pico_blinky: example('pico_blinky', { group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true }),
  pico_blinky_ton: example('pico_blinky_ton', { group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true }),
  pico_blinky_blink: example('pico_blinky_blink', { group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true }),
  esp32s3_blinky: example('esp32s3_blinky', { group: 'boards', level: 'beginner', languages: ['ST'], board: 'esp32s3_devkitc', showOnWelcome: true }),
  opta_led_chaser: example('opta_led_chaser', { group: 'boards', level: 'intermediate', languages: ['ST'], board: 'arduino_opta_wifi', showOnWelcome: true }),
  opta_led_chaser_ld: example('opta_led_chaser_ld', { group: 'boards', level: 'intermediate', languages: ['LD'], board: 'arduino_opta_wifi', showOnWelcome: true }),
  multitask_demo: example('multitask_demo', { group: 'boards', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', noScenario: true, showOnWelcome: true }),
  analog_test: example('analog_test', { group: 'boards', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true }),

  // Test fixtures, kept out of the learner's list
  kitchen_sink: example('kitchen_sink', { group: 'fixtures', level: 'advanced', languages: ['ST'], showOnWelcome: false }),
  pico_persist_test: example('pico_persist_test', { group: 'fixtures', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', noScenario: true, showOnWelcome: false }),
};

/** What the Welcome screen shows for one example. `level` is missing for a project that has no entry. */
export interface ExampleListing {
  id: string;
  title: string;
  summary: string;
  level?: ExampleLevel;
  languages: readonly ExampleLanguage[];
  board?: string;
  /** Why a hardware example has no scenario, in the language of the interface; absent when it has one. */
  noScenario?: string;
}

export interface ExampleSection { id: ExampleGroupId; title: string; blurb: string; examples: ExampleListing[] }

/**
 * Turns the projects the app bundles into the sections of the Welcome screen: the groups of the catalogue in order, then
 * "More examples" for every project the catalogue does not know. Sections without an example are left out.
 */
export function buildExampleSections(projects: ReadonlyArray<Pick<ProjectInfo, 'id' | 'name' | 'description'>>): ExampleSection[] {
  const present = new Map(projects.map((project) => [project.id, project]));
  const sections: ExampleSection[] = EXAMPLE_GROUPS.map((group) => ({ id: group.id, title: t(group.titleKey), blurb: group.blurbKey ? t(group.blurbKey) : '', examples: [] }));
  const section = (id: ExampleGroupId) => sections.find((candidate) => candidate.id === id)!;

  for (const [id, entry] of Object.entries(EXAMPLE_CATALOG)) {
    if (!present.has(id) || !entry.showOnWelcome) continue;
    section(entry.group).examples.push({ id, title: entry.title, summary: entry.summary, level: entry.level, languages: entry.languages, board: entry.board, ...(entry.noScenario ? { noScenario: t(`examples.${id}.noScenario` as MessageKey) } : {}) });
  }
  const uncatalogued = projects.filter((project) => !(project.id in EXAMPLE_CATALOG)).sort((a, b) => a.name.localeCompare(b.name));
  for (const project of uncatalogued) section('more').examples.push({ id: project.id, title: project.name, summary: project.description ?? '', languages: [] });

  return sections.filter((candidate) => candidate.examples.length > 0);
}

export interface ExampleLevelGroup { level: ExampleLevel | null; examples: ExampleListing[] }

/**
 * The examples of one topic split by level, easiest first (UX-022): the Welcome screen groups them by topic and, inside a topic
 * that holds more than one level, by level. An example with no level (a project the catalogue does not know) comes last.
 */
export function groupByLevel(examples: readonly ExampleListing[]): ExampleLevelGroup[] {
  const groups: ExampleLevelGroup[] = [...EXAMPLE_LEVELS, null].map((level) => ({ level, examples: examples.filter((example) => (example.level ?? null) === level) }));
  return groups.filter((group) => group.examples.length > 0);
}
