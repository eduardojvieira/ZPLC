import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { EXAMPLE_CATALOG, EXAMPLE_GROUPS, boardName, buildExampleSections } from './exampleCatalog';

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

/** Another change adds these folders; the catalogue already knows them and must cope with their absence or presence. */
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
      expect([...entry.languages].sort(), `${id} languages`).toEqual(builtLanguages(id));
      const board = manifest(id).target?.board;
      expect(entry.board, `${id} board`).toBe(board === 'posix' ? undefined : board);
    }
  });

  it('names the board an example really targets, not the one its folder name suggests', () => {
    expect(EXAMPLE_CATALOG.pico_blinky?.board).toBe('esp32s3_devkitc');
    expect(boardName('esp32s3_devkitc')).toContain('ESP32-S3');
    expect(`${EXAMPLE_CATALOG.pico_blinky?.title} ${EXAMPLE_CATALOG.pico_blinky?.summary}`).not.toMatch(/pico/i);
    expect(boardName('rpi_pico')).toBe('Raspberry Pi Pico');
    expect(boardName('arduino_opta_wifi')).toContain('Opta');
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
    const tour = listedFolders.some((id) => LANGUAGE_TOUR.includes(id)) ? ['Language tour'] : [];
    expect(sections.map((section) => section.title)).toEqual(['First steps', 'Motors and drives', 'Process and sequences', ...tour, 'Boards and hardware']);
    const byGroup = Object.fromEntries(sections.map((section) => [section.id, section.examples.map((example) => example.id)]));
    expect(byGroup['first-steps']).toEqual(['scan_snapshot', 'blinky', 'edge_counter']);
    expect(byGroup.motors).toEqual(['motor_start_stop', 'motor_control', 'motor_plant']);
    expect(byGroup.process).toEqual(['tank_level', 'conveyor_01', 'pedestrian_crossing']);
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
    expect(boards.examples.find((example) => example.id === 'pico_blinky')?.board).toBe('esp32s3_devkitc');
    expect(sections.find((section) => section.id === 'motors')!.examples.every((example) => example.board === undefined)).toBe(true);
  });
});
