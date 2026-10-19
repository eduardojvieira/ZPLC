import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { EXAMPLE_CATALOG, EXAMPLE_GROUPS, boardName, buildExampleSections, groupByLevel, languageName, levelName, type ExampleListing } from './exampleCatalog';
import { en, type MessageKey } from '../i18n/en';
import { es } from '../i18n/es';
import { useAppSettings } from '../store/useAppSettings';

const projectsDir = join(import.meta.dir, '..', '..', 'projects');

type Manifest = { name: string; description?: string; version?: string; target?: { board?: string }; tasks?: Array<{ programs?: string[] }> };
const manifest = (id: string): Manifest => JSON.parse(readFileSync(join(projectsDir, id, 'zplc.json'), 'utf8')) as Manifest;
const projectInfo = (id: string) => ({ id, name: manifest(id).name, description: manifest(id).description, version: manifest(id).version ?? '1.0.0', path: `/projects/${id}` });

/** Every folder of projects/ the loader lists: the `_starter` folders belong to the Learn tab and stay out of the list. */
const listedFolders = readdirSync(projectsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.endsWith('_starter') && existsSync(join(projectsDir, entry.name, 'zplc.json')))
  .map((entry) => entry.name)
  .sort();

/** A folder is named here only when it is deliberately left to the "More examples" fallback instead of getting an entry. */
const DELIBERATELY_UNCATALOGUED: string[] = [];

const LANGUAGE_BY_EXTENSION: Record<string, string> = { st: 'ST', ld: 'LD', il: 'IL', fbd: 'FBD', sfc: 'SFC' };
/** The languages of the programs a project's tasks build (orphan source files in src/ do not count). */
const builtLanguages = (id: string) => [...new Set((manifest(id).tasks ?? []).flatMap((task) => task.programs ?? []).map((program) => LANGUAGE_BY_EXTENSION[program.split('.').at(-1)!]))].sort();

const everyListing = (sections: ReturnType<typeof buildExampleSections>) => sections.flatMap((section) => section.examples);

/** The four language-tour folders; the catalogue must cope with their absence as well as their presence. */
const LANGUAGE_TOUR = ['blinky_st', 'blinky_il', 'blinky_fbd', 'blinky_sfc'];

describe('example catalogue', () => {
  it('has an entry for every project folder, or names the folder as deliberately left to the fallback', () => {
    const missing = listedFolders.filter((id) => !(id in EXAMPLE_CATALOG) && !DELIBERATELY_UNCATALOGUED.includes(id));
    expect(missing).toEqual([]);
  });

  it('never lists a Learn starter', () => {
    expect(Object.keys(EXAMPLE_CATALOG).filter((id) => id.endsWith('_starter'))).toEqual([]);
  });

  it('gives every entry a title, a one-line summary, a known group and at least one language', () => {
    const groups = EXAMPLE_GROUPS.map((group) => group.id);
    for (const [id, entry] of Object.entries(EXAMPLE_CATALOG)) {
      expect(entry.title.trim().length, `${id} title`).toBeGreaterThan(0);
      expect(entry.summary.trim().length, `${id} summary`).toBeGreaterThan(0);
      expect(entry.summary, `${id} summary is one line`).not.toContain('\n');
      expect(entry.summary.length, `${id} summary is short enough to read at a glance`).toBeLessThanOrEqual(130);
      expect(groups, `${id} group`).toContain(entry.group);
      expect(entry.languages.length, `${id} languages`).toBeGreaterThan(0);
    }
  });

  it('describes each existing project by what its manifest builds and targets', () => {
    for (const id of listedFolders.filter((folder) => folder in EXAMPLE_CATALOG)) {
      const entry = EXAMPLE_CATALOG[id]!;
      expect(([...entry.languages] as string[]).sort(), `${id} languages`).toEqual(builtLanguages(id));
      const board = manifest(id).target?.board;
      expect(entry.board, `${id} board`).toBe(board === 'posix' ? undefined : board);
    }
  });

  it('names the board an example really targets, not the one its folder name suggests', () => {
    const text = (id: string) => `${EXAMPLE_CATALOG[id]?.title} ${EXAMPLE_CATALOG[id]?.summary}`;
    expect(EXAMPLE_CATALOG.pico_blinky?.board).toBe('rpi_pico');
    expect(EXAMPLE_CATALOG.esp32s3_blinky?.board).toBe('esp32s3_devkitc');
    for (const id of ['pico_blinky', 'pico_blinky_ton', 'pico_blinky_blink', 'pico_persist_test']) {
      expect(text(id), id).toMatch(/pico/i);
      expect(text(id), id).not.toMatch(/esp32/i);
    }
    expect(text('esp32s3_blinky')).toMatch(/esp32/i);
    expect(text('esp32s3_blinky')).not.toMatch(/pico/i);
    expect(boardName('esp32s3_devkitc')).toContain('ESP32-S3');
    expect(boardName('rpi_pico')).toBe('Raspberry Pi Pico');
    expect(boardName('arduino_opta_wifi')).toContain('Opta');
  });

  it('does not promise a pin mapping the overlay does not give: the ESP32-S3 pin is "per the current overlay"', () => {
    expect(EXAMPLE_CATALOG.esp32s3_blinky?.summary).toContain('per the current overlay');
    expect(EXAMPLE_CATALOG.esp32s3_blinky?.summary).toContain('DevKitC-1');
    expect(EXAMPLE_CATALOG.esp32s3_blinky?.summary).toMatch(/pending/i);
  });

  it('says that BLINK is a ZPLC extension and TON the IEC timer', () => {
    expect(EXAMPLE_CATALOG.pico_blinky_blink?.summary).toMatch(/ZPLC extension/);
    expect(EXAMPLE_CATALOG.pico_blinky_blink?.summary).toMatch(/not (part of )?IEC/);
    expect(EXAMPLE_CATALOG.pico_blinky_ton?.summary).toMatch(/TON/);
    expect(EXAMPLE_CATALOG.pico_blinky_ton?.summary).not.toMatch(/BLINK/);
  });

  it('names a function block only if the project\'s sources use it', () => {
    for (const id of listedFolders.filter((folder) => folder in EXAMPLE_CATALOG)) {
      const entry = EXAMPLE_CATALOG[id]!;
      const sources = readdirSync(join(projectsDir, id, 'src')).map((file) => readFileSync(join(projectsDir, id, 'src', file), 'utf8')).join('\n');
      for (const block of ['TON', 'TOF', 'TP', 'BLINK', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG']) {
        const named = new RegExp(`\\b${block}\\b`).test(`${entry.title} ${entry.summary}`);
        if (named) expect(new RegExp(`\\b${block}\\b`).test(sources), `${id} names ${block}, which its sources never use`).toBe(true);
      }
    }
  });

  it('describes the persistence test as what it is: a two-task smoke test, not a retained-data test', () => {
    const entry = EXAMPLE_CATALOG.pico_persist_test!;
    expect(entry.title).toBe('Pico two-task smoke test');
    expect(`${entry.title} ${entry.summary}`).not.toMatch(/persist|retain|retentive/i);
    expect(entry.summary).toMatch(/two|fast/i);
  });

  it('counts the Edge Counter with CTU alone', () => {
    expect(EXAMPLE_CATALOG.edge_counter?.summary).toContain('CTU');
    expect(EXAMPLE_CATALOG.edge_counter?.summary).not.toContain('R_TRIG');
  });

  it('hides the test fixtures and shows every other example', () => {
    const hidden = Object.entries(EXAMPLE_CATALOG).filter(([, entry]) => !entry.showOnWelcome).map(([id]) => id).sort();
    expect(hidden).toEqual(['kitchen_sink', 'pico_persist_test']);
  });

  it('gives the three motor examples titles a learner can tell apart', () => {
    const titles = ['motor_start_stop', 'motor_control', 'motor_plant'].map((id) => EXAMPLE_CATALOG[id]!.title);
    expect(new Set(titles).size).toBe(3);
  });
});

describe('Welcome example sections', () => {
  const sections = buildExampleSections(listedFolders.map(projectInfo));

  it('groups the examples under their headings, in the order of the groups', () => {
    expect(sections.map((section) => section.title)).toEqual(['First steps', 'Motors and drives', 'Process and sequences', 'Language tour', 'Boards and hardware']);
    const byGroup = Object.fromEntries(sections.map((section) => [section.id, section.examples.map((example) => example.id)]));
    expect(byGroup['first-steps']).toEqual(['first_blink', 'scan_snapshot', 'blinky', 'edge_counter', 'enabled_blink', 'two_hand', 'alarm_latch', 'delays', 'seal_in_ladder', 'batch_count_fbd', 'door_alarm_il', 'gate_latch']);
    expect(byGroup.motors).toEqual(['motor_start_stop', 'motor_control', 'motor_plant', 'interlock_guard']);
    expect(byGroup.process).toEqual(['tank_level', 'conveyor_01', 'pedestrian_crossing', 'typed_steps', 'scaling', 'fill_mix_sfc', 'pump_pair', 'call_panel']);
    expect(byGroup.languages).toEqual(LANGUAGE_TOUR);
    expect(byGroup.boards).toEqual(['pico_blinky', 'pico_blinky_ton', 'pico_blinky_blink', 'esp32s3_blinky', 'opta_led_chaser', 'opta_led_chaser_ld', 'multitask_demo', 'analog_test']);
  });

  it('lists every visible folder exactly once and no fixture', () => {
    const ids = everyListing(sections).map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('kitchen_sink');
    expect(ids).not.toContain('pico_persist_test');
    expect([...ids].sort()).toEqual(listedFolders.filter((id) => EXAMPLE_CATALOG[id]?.showOnWelcome !== false).sort());
  });

  it('gives every listing a title and a summary to choose with', () => {
    for (const example of everyListing(sections)) {
      expect(example.title.length, example.id).toBeGreaterThan(0);
      expect(example.summary.length, example.id).toBeGreaterThan(0);
      expect(example.languages.length, example.id).toBeGreaterThan(0);
    }
  });

  it('puts a project that has no entry under "More examples", last, with its manifest name and description', () => {
    const extra = [
      { id: 'zeta_new', name: 'Zeta New', description: 'A project added without a catalogue entry.', version: '1.0.0', path: '/projects/zeta_new' },
      { id: 'alpha_new', name: 'Alpha New', version: '1.0.0', path: '/projects/alpha_new' },
    ];
    const withExtra = buildExampleSections([...listedFolders.map(projectInfo), ...extra]);
    const more = withExtra.at(-1)!;
    expect(more).toMatchObject({ id: 'more', title: 'More examples' });
    expect(more.examples.map((example) => example.id)).toEqual(['alpha_new', 'zeta_new']);
    expect(more.examples[1]).toMatchObject({ title: 'Zeta New', summary: 'A project added without a catalogue entry.' });
    expect(withExtra.slice(0, -1).map((section) => section.id)).toEqual(sections.map((section) => section.id));
  });

  it('has no "More examples" section while every project has an entry', () => {
    expect(sections.some((section) => section.id === 'more')).toBe(false);
  });

  it('skips catalogue entries whose folder does not exist yet and picks them up once it does', () => {
    const without = listedFolders.filter((id) => !LANGUAGE_TOUR.includes(id)).map(projectInfo);
    expect(EXAMPLE_CATALOG.blinky_st).toBeDefined();
    const before = buildExampleSections(without);
    expect(everyListing(before).some((example) => LANGUAGE_TOUR.includes(example.id))).toBe(false);
    expect(before.some((section) => section.id === 'languages')).toBe(false);
    expect(() => buildExampleSections([])).not.toThrow();
    expect(buildExampleSections([])).toEqual([]);

    const arrived = LANGUAGE_TOUR.map((id) => ({ id, name: id, version: '1.0.0', path: `/projects/${id}` }));
    const tour = buildExampleSections([...without, ...arrived]).find((section) => section.id === 'languages')!;
    expect(tour.title).toBe('Language tour');
    expect(tour.examples.map((example) => example.id)).toEqual(LANGUAGE_TOUR);
    expect(tour.examples.map((example) => example.languages)).toEqual([['ST'], ['IL'], ['FBD'], ['SFC']]);
  });

  it('carries the board of a hardware example to its listing', () => {
    const boards = sections.find((section) => section.id === 'boards')!;
    expect(boards.examples.find((example) => example.id === 'pico_blinky')?.board).toBe('rpi_pico');
    expect(boards.examples.find((example) => example.id === 'esp32s3_blinky')?.board).toBe('esp32s3_devkitc');
    expect(sections.find((section) => section.id === 'motors')!.examples.every((example) => example.board === undefined)).toBe(true);
  });
});

describe('the scenario of a hardware example (LRN-036)', () => {
  const hasScenario = (id: string) => existsSync(join(projectsDir, id, 'tests')) && readdirSync(join(projectsDir, id, 'tests')).some((name) => name.endsWith('.scenario.json'));
  const hardware = Object.entries(EXAMPLE_CATALOG).filter(([id, entry]) => entry.board !== undefined && existsSync(join(projectsDir, id)));

  it('LRN-036 gives each hardware example a scenario, or states in both languages why it has none', () => {
    expect(hardware.length).toBeGreaterThan(5);
    for (const [id, entry] of hardware) {
      if (hasScenario(id)) { expect(entry.noScenario, `${id} has a scenario and also says it has none`).toBeUndefined(); continue; }
      expect(entry.noScenario, `${id} is a hardware example with no scenario and no reason`).toBeDefined();
      expect(en[`examples.${id}.noScenario` as MessageKey], id).toBeTruthy();
      expect(es[`examples.${id}.noScenario` as MessageKey], id).toBeTruthy();
    }
  });

  it('LRN-036 carries the reason to the listing of the example that has none', () => {
    const boards = buildExampleSections(listedFolders.map(projectInfo)).find((section) => section.id === 'boards')!;
    expect(boards.examples.find((example) => example.id === 'multitask_demo')?.noScenario).toBe(en['examples.multitask_demo.noScenario' as MessageKey]);
    expect(boards.examples.find((example) => example.id === 'pico_blinky')?.noScenario).toBeUndefined();
  });
});

describe('the Welcome examples by level and topic (UX-022)', () => {
  const listing = (id: string, level?: ExampleListing['level']): ExampleListing => ({ id, title: id, summary: '', languages: ['ST'], ...(level ? { level } : {}) });

  it('UX-022 splits a topic by level, the easiest first, and puts an example with no level last', () => {
    const groups = groupByLevel([listing('c', 'advanced'), listing('x'), listing('a', 'beginner'), listing('b', 'intermediate'), listing('a2', 'beginner')]);
    expect(groups.map((group) => group.level)).toEqual(['beginner', 'intermediate', 'advanced', null]);
    expect(groups[0]!.examples.map((example) => example.id)).toEqual(['a', 'a2']);
    expect(groupByLevel([])).toEqual([]);
    expect(groupByLevel([listing('only', 'intermediate')]).map((group) => group.level)).toEqual(['intermediate']);
  });

  it('UX-022 names levels, languages, boards and groups in the language of the interface', () => {
    const before = useAppSettings.getState().settings.language;
    try {
      useAppSettings.getState().update({ language: 'en' });
      expect([levelName('beginner'), languageName('LD'), boardName('rpi_pico'), buildExampleSections([{ id: 'blinky', name: 'Blinky', description: '' }])[0]!.title]).toEqual(['Beginner', 'Ladder diagram', 'Raspberry Pi Pico', 'First steps']);
      useAppSettings.getState().update({ language: 'es' });
      expect([levelName('beginner'), levelName('advanced'), languageName('ST'), buildExampleSections([{ id: 'blinky', name: 'Blinky', description: '' }])[0]!.title]).toEqual(['Principiante', 'Avanzado', 'Texto estructurado', 'Primeros pasos']);
    } finally {
      useAppSettings.getState().update({ language: before });
    }
  });

  it('UX-022 shows a board id the catalogs do not know as written', () => {
    expect(boardName('some_new_board')).toBe('some_new_board');
  });
});

describe('UX-029 the examples read their title and summary from the catalogs', () => {
  it('UX-029 has a title and a summary in English and in Spanish for every catalogued example, and follows the language setting', () => {
    for (const id of Object.keys(EXAMPLE_CATALOG)) {
      for (const part of ['title', 'summary'] as const) {
        const key = `examples.${id}.${part}` as MessageKey;
        expect(en[key], key).toBeDefined();
        expect(es[key], key).toBeDefined();
      }
    }
    expect(EXAMPLE_CATALOG.tank_level?.title).toBe('Tank level controller');
    useAppSettings.getState().update({ language: 'es' });
    try {
      expect(EXAMPLE_CATALOG.tank_level?.title).toBe('Controlador de nivel de tanque');
      expect(EXAMPLE_CATALOG.motor_start_stop?.summary).toContain('autorretención');
    } finally { useAppSettings.getState().update({ language: 'auto' }); }
  });
});
