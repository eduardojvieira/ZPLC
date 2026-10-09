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
  showOnWelcome: boolean;
}

export const EXAMPLE_GROUPS: ReadonlyArray<{ id: ExampleGroupId; title: string; blurb: string }> = [
  { id: 'first-steps', title: 'First steps', blurb: 'One idea each. Start here.' },
  { id: 'motors', title: 'Motors and drives', blurb: 'Start, stop, feedback and safety inputs.' },
  { id: 'process', title: 'Process and sequences', blurb: 'Level control, fault handling and sequences.' },
  { id: 'languages', title: 'Language tour', blurb: 'The same 50% LED blinker in four more languages (the Ladder one is Blinky, above).' },
  { id: 'boards', title: 'Boards and hardware', blurb: 'Each one targets a named board.' },
  { id: 'fixtures', title: 'Test fixtures', blurb: '' },
  { id: 'more', title: 'More examples', blurb: '' },
];

export const LANGUAGE_NAMES: Readonly<Record<ExampleLanguage, string>> = {
  ST: 'Structured Text',
  LD: 'Ladder Diagram',
  IL: 'Instruction List',
  FBD: 'Function Block Diagram',
  SFC: 'Sequential Function Chart',
};

export const LEVEL_NAMES: Readonly<Record<ExampleLevel, string>> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const BOARD_NAMES: Readonly<Record<string, string>> = {
  rpi_pico: 'Raspberry Pi Pico',
  esp32s3_devkitc: 'ESP32-S3 DevKitC',
  arduino_opta_wifi: 'Arduino Opta WiFi',
};

/** The name of a manifest board id; an id this table does not know is shown as written. */
export const boardName = (board: string): string => BOARD_NAMES[board] ?? board;

export const EXAMPLE_CATALOG: Readonly<Record<string, ExampleEntry>> = {
  // First steps
  scan_snapshot: { title: 'Scan Snapshot', summary: 'How one scan works: a button is copied, delayed by one scan and turned into a rising-edge pulse.', group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true },
  blinky: { title: 'Blinky', summary: 'A 50% LED blinker in Ladder Diagram: two TON timers and SET/RESET coils.', group: 'first-steps', level: 'beginner', languages: ['LD'], showOnWelcome: true },
  edge_counter: { title: 'Edge Counter', summary: 'Counts rising edges of a pulse input with a CTU counter; the output turns on after three pulses.', group: 'first-steps', level: 'beginner', languages: ['ST'], showOnWelcome: true },

  // Motors and drives
  motor_start_stop: { title: 'Motor Start Stop', summary: 'Start with seal-in; Stop, E-stop or Overload drops the motor, and a held Start cannot restart it.', group: 'motors', level: 'beginner', languages: ['ST'], showOnWelcome: true },
  motor_control: { title: 'Motor Start/Stop in Ladder', summary: 'A motor start/stop in Ladder: Start seals in through the contactor\'s own contact; Stop or Overload drops it.', group: 'motors', level: 'beginner', languages: ['LD'], showOnWelcome: true },
  motor_plant: { title: 'Motor with Speed Feedback', summary: 'Start and Stop command a motor; Running needs AtSpeed feedback, or a start-failure timeout latches a Fault.', group: 'motors', level: 'intermediate', languages: ['ST'], showOnWelcome: true },

  // Process and sequences
  tank_level: { title: 'Tank Level Controller', summary: 'A pump that starts at low level and stops at high level; E-stop or pump fault latches an alarm until Reset.', group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true },
  conveyor_01: { title: 'Conveyor with Diverter', summary: 'A conveyor belt with start/stop, a diverter for metal parts and a jam fault that needs Reset.', group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true },
  pedestrian_crossing: { title: 'Pedestrian Crossing', summary: 'A traffic-light sequence: a pedestrian request takes vehicles from green through yellow to red, then shows WALK.', group: 'process', level: 'intermediate', languages: ['ST'], showOnWelcome: true },

  // Language tour
  blinky_st: { title: 'Blinky (Structured Text)', summary: 'A 50% LED blinker in Structured Text: one TON timer and a toggled state variable.', group: 'languages', level: 'beginner', languages: ['ST'], showOnWelcome: true },
  blinky_il: { title: 'Blinky (Instruction List)', summary: 'A 50% LED blinker in Instruction List: two TON timers driving S and R operators.', group: 'languages', level: 'beginner', languages: ['IL'], showOnWelcome: true },
  blinky_fbd: { title: 'Blinky (Function Block Diagram)', summary: 'A 50% LED blinker as a Function Block Diagram: two TON timers and a hold-OR-AND latch.', group: 'languages', level: 'beginner', languages: ['FBD'], showOnWelcome: true },
  blinky_sfc: { title: 'Blinky (Sequential Function Chart)', summary: 'A 50% LED blinker as a Sequential Function Chart: two timed steps, LED_ON and LED_OFF.', group: 'languages', level: 'beginner', languages: ['SFC'], showOnWelcome: true },

  // Boards and hardware
  pico_blinky: { title: 'Pico Blinky', summary: 'Blinks an LED on GP0 every 500 ms by counting 10 ms scans, and holds GP1 high while it runs.', group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true },
  pico_blinky_ton: { title: 'Pico Blinky (TON)', summary: 'Blinks an LED on GP0 every 500 ms with an IEC TON timer, so the time does not depend on the task interval.', group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true },
  pico_blinky_blink: { title: 'Pico Blinky (BLINK block)', summary: 'Blinks an LED on GP0 every 500 ms with BLINK, a ZPLC extension that is not part of IEC 61131-3.', group: 'boards', level: 'beginner', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true },
  esp32s3_blinky: { title: 'ESP32-S3 Blinky', summary: 'Blinks an LED on GPIO38 by counting scans; the pin is per the current overlay, the DevKitC-1 mapping is pending.', group: 'boards', level: 'beginner', languages: ['ST'], board: 'esp32s3_devkitc', showOnWelcome: true },
  opta_led_chaser: { title: 'Opta LED Chaser', summary: 'A light that sweeps back and forth across the Opta outputs D0 to D3, advanced by a timer.', group: 'boards', level: 'intermediate', languages: ['ST'], board: 'arduino_opta_wifi', showOnWelcome: true },
  opta_led_chaser_ld: { title: 'Opta LED Chaser (Ladder)', summary: 'The same sweeping light as a Ladder Diagram: a TON tick and a six-position shift register.', group: 'boards', level: 'intermediate', languages: ['LD'], board: 'arduino_opta_wifi', showOnWelcome: true },
  multitask_demo: { title: 'Multitask Demo', summary: 'Two tasks at different rates, 10 ms and 100 ms, each blinking its own LED.', group: 'boards', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true },
  analog_test: { title: 'Analog Temperature Reading', summary: 'Reads the Pico\'s internal temperature sensor (%IW8), converts it to degrees Celsius and flags an implausible reading.', group: 'boards', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', showOnWelcome: true },

  // Test fixtures, kept out of the learner's list
  kitchen_sink: { title: 'Kitchen Sink', summary: 'Test fixture that exercises every standard-library function block and function.', group: 'fixtures', level: 'advanced', languages: ['ST'], showOnWelcome: false },
  pico_persist_test: { title: 'Pico Two-Task Smoke Test', summary: 'Hardware smoke test: a fast counter task and a 100 ms task that blinks an LED on GP0 every 500 ms.', group: 'fixtures', level: 'intermediate', languages: ['ST'], board: 'rpi_pico', showOnWelcome: false },
};

/** What the Welcome screen shows for one example. `level` is missing for a project that has no entry. */
export interface ExampleListing {
  id: string;
  title: string;
  summary: string;
  level?: ExampleLevel;
  languages: readonly ExampleLanguage[];
  board?: string;
}

export interface ExampleSection { id: ExampleGroupId; title: string; blurb: string; examples: ExampleListing[] }

/**
 * Turns the projects the app bundles into the sections of the Welcome screen: the groups of the catalogue in order, then
 * "More examples" for every project the catalogue does not know. Sections without an example are left out.
 */
export function buildExampleSections(projects: ReadonlyArray<Pick<ProjectInfo, 'id' | 'name' | 'description'>>): ExampleSection[] {
  const present = new Map(projects.map((project) => [project.id, project]));
  const sections: ExampleSection[] = EXAMPLE_GROUPS.map((group) => ({ ...group, examples: [] }));
  const section = (id: ExampleGroupId) => sections.find((candidate) => candidate.id === id)!;

  for (const [id, entry] of Object.entries(EXAMPLE_CATALOG)) {
    if (!present.has(id) || !entry.showOnWelcome) continue;
    section(entry.group).examples.push({ id, title: entry.title, summary: entry.summary, level: entry.level, languages: entry.languages, board: entry.board });
  }
  const uncatalogued = projects.filter((project) => !(project.id in EXAMPLE_CATALOG)).sort((a, b) => a.name.localeCompare(b.name));
  for (const project of uncatalogued) section('more').examples.push({ id: project.id, title: project.name, summary: project.description ?? '', languages: [] });

  return sections.filter((candidate) => candidate.examples.length > 0);
}
