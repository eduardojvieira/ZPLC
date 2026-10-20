import { afterEach, describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bomProblems } from '../boards/wiring/kit';
import { programWiringProblems, wiringSafetyProblems } from '../boards/wiring/wiring';
import { BOARDS, WIRING } from '../boards/wiring/wiring.fixtures';
import { LESSONS_DIRECTORY, buildIndex, loadCourse, loadLearnerBoards, loadLessonPackages, programAddresses, PROJECTS_DIRECTORY } from './lessonPackageFiles';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

/** A copy of the lessons in which blink-structured-text (Enable on %I0.0, Lamp on %Q0.0) has the hardware track with these parts. */
function lessonsWithHardware(parts: unknown[] | null): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-hw-lessons-'));
  temporary.push(root);
  cpSync(LESSONS_DIRECTORY, root, { recursive: true });
  const file = join(root, 'blink-structured-text', 'lesson.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, JSON.stringify({ ...manifest, tracks: ['simulation', 'hardware'], unsupported: {}, hardware: { wiring: 'wiring.json', tolerances: { timeMs: 50, analogPercent: 5 } } }));
  if (parts) writeFileSync(join(root, 'blink-structured-text', 'wiring.json'), JSON.stringify({ schemaVersion: 1, parts }));
  else rmSync(join(root, 'blink-structured-text', 'wiring.json'), { force: true });
  return root;
}
const lamp = { id: 'lamp', kind: 'led', channel: 'DO0', color: 'red', resistorOhms: 330, label: { en: 'Lamp', es: 'Lámpara' } };
const enable = { id: 'enable', kind: 'button', channel: 'DI0', label: { en: 'Enable', es: 'Habilitar' } };
const problemsOf = (root: string) => loadLessonPackages(root).problems.filter((problem) => problem.includes('blink-structured-text'));

describe('the hardware track of a lesson package (LRN-013, LRN-014, LRN-027)', () => {
  it('reads the two learner boards from kit.json and their I/O from boards.json', () => {
    const { boards, problems } = loadLearnerBoards();
    expect(problems).toEqual([]);
    expect(boards.map((board) => board.boardId)).toEqual(['rpi-pico-rp2040', 'esp32-s3-devkitc']);
    for (const board of boards) for (const id of ['DO0', 'DO1', 'DO2', 'DO3', 'DI0', 'DI1', 'DI2', 'DI3', 'AI0']) expect(board.io.channels.some((channel) => channel.id === id)).toBe(true);
  });

  it('accepts a hardware lesson whose wiring covers the I/O of its program, and puts the wiring in the index', () => {
    const root = lessonsWithHardware([lamp, enable]);
    expect(problemsOf(root)).toEqual([]);
    const loaded = loadLessonPackages(root);
    const entry = buildIndex(loaded.packages, loadCourse(root).course!).index.lessons.find((lesson) => lesson.id === 'blink-structured-text')!;
    expect(entry.hardware).toEqual({ wiring: { schemaVersion: 1, parts: [lamp, enable] }, tolerances: { timeMs: 50, analogPercent: 5 } });
    expect(buildIndex(loaded.packages, loadCourse(root).course!).index.lessons.find((lesson) => lesson.id === 'first-blink-simulation')!.hardware).toBeNull();
  });

  it('refuses a hardware lesson without wiring.json, and wiring.json in a lesson without the hardware track', () => {
    expect(problemsOf(lessonsWithHardware(null))).toEqual(['blink-structured-text: the lesson is on the hardware track but has no wiring.json']);
    const root = lessonsWithHardware(null);
    writeFileSync(join(root, 'first-blink-simulation', 'wiring.json'), JSON.stringify({ schemaVersion: 1, parts: [lamp] }));
    expect(loadLessonPackages(root).problems).toContain('first-blink-simulation: wiring.json belongs to a lesson on the hardware track');
  });

  it('refuses a channel that one of the learner boards does not have', () => {
    expect(problemsOf(lessonsWithHardware([lamp, enable, { ...lamp, id: 'extra', channel: 'DO4' }]))).toContain('blink-structured-text/wiring.json: part "extra": channel DO4 does not exist on ESP32-S3-DevKitC-1 (N8R8)');
  });

  it('refuses a program I/O that no part wires, on either board', () => {
    expect(problemsOf(lessonsWithHardware([lamp]))).toEqual([
      'blink-structured-text/wiring.json: the program uses %IX0.0 (DI0) on Raspberry Pi Pico (RP2040), but no part is wired to it',
      'blink-structured-text/wiring.json: the program uses %IX0.0 (DI0) on ESP32-S3-DevKitC-1 (N8R8), but no part is wired to it',
    ]);
  });

  it('reads the located I/O of a program in every language, and the virtual addresses of its project', () => {
    expect(programAddresses(join(PROJECTS_DIRECTORY, 'enabled_blink'))).toEqual({ addresses: ['%IX0.0', '%QX0.0'], virtual: [] });
    expect(programAddresses(join(PROJECTS_DIRECTORY, 'seal_in_ladder')).addresses).toEqual(['%IX0.0', '%IX0.1', '%QX0.0']);
  });
});

describe('a program and its wiring, on each learner board (LRN-014)', () => {
  it('needs a part on every channel the program uses, and a use for every part it wires', () => {
    expect(programWiringProblems(WIRING, BOARDS, ['%QX0.0', '%QX0.1', '%QX0.4', '%IX0.0', '%IX0.1', '%IX0.3', '%IW4'], ['%QX0.4'])).toEqual([]);
    expect(programWiringProblems(WIRING, BOARDS, ['%QX0.0', '%QX0.1', '%QX0.4', '%IX0.0', '%IX0.3', '%IW4'], ['%QX0.4'])).toEqual([
      'part "armed" is wired to DI1 on Raspberry Pi Pico (RP2040), which the program does not use',
      'part "armed" is wired to DI1 on ESP32-S3-DevKitC-1 (N8R8), which the program does not use',
    ]);
  });

  it('lets an address that a board has no channel for pass only when the project declares it virtual', () => {
    const onboard = { id: 'onboard', kind: 'led', channel: 'DO4', boards: ['rpi-pico-rp2040'], label: { en: 'On-board LED', es: 'LED de la placa' } };
    const wiring = { schemaVersion: 1 as const, parts: [onboard] };
    expect(programWiringProblems(wiring, BOARDS, ['%QX0.4'], [])).toEqual(['the program uses %QX0.4, which ESP32-S3-DevKitC-1 (N8R8) has no channel for; declare it in io.virtual of the project if no pin drives it there']);
    expect(programWiringProblems(wiring, BOARDS, ['%QX0.4'], ['%QX0.4'])).toEqual([]);
  });
});

describe('LRN-016 the course wires only logic-level I/O and low-voltage parts, and no mains', () => {
  it('refuses a lesson whose wiring has a part outside the low-voltage kinds or an LED without its resistor', () => {
    expect(problemsOf(lessonsWithHardware([{ ...lamp, kind: 'relay', color: undefined, resistorOhms: undefined }, enable]))).toContain('blink-structured-text/wiring.json: part "lamp": kind "relay" is not a low-voltage part of the course (led, resistor, button, potentiometer, capacitor, jumper)');
    expect(problemsOf(lessonsWithHardware([{ ...lamp, resistorOhms: 100 }, enable]))).toContain('blink-structured-text/wiring.json: part "lamp": an LED needs a series resistor of at least 330 ohms, it has 100');
  });

  it('holds for every lesson of the course on the hardware track', () => {
    const { boards } = loadLearnerBoards();
    for (const lesson of loadLessonPackages().packages.filter((item) => item.manifest.tracks.includes('hardware'))) {
      expect({ lesson: lesson.id, problems: wiringSafetyProblems(lesson.wiring!, boards) }).toEqual({ lesson: lesson.id, problems: [] });
    }
  });
});

describe('the bill of materials covers every hardware lesson (LRN-014)', () => {
  it('has enough of every part for the union of the wiring of all hardware lessons, on both learner boards', () => {
    const { kit, boards } = loadLearnerBoards();
    const lessons = loadLessonPackages().packages.flatMap((lesson) => (lesson.wiring ? [{ id: lesson.id, wiring: lesson.wiring }] : []));
    expect(bomProblems(kit!.bom, lessons, boards)).toEqual([]);
  });
});

/**
 * The modules that course.json offers on the hardware track but that have no lesson a learner board can run yet, each
 * with the reason. The list is exact: a module that gains a hardware lesson must leave it.
 */
const MODULES_WITHOUT_A_HARDWARE_LESSON: Record<number, string> = {
  6: 'every module 6 lesson needs the simulated motor or tank plant (feedback, level, faults); the curriculum says "hardware in part" and the planned Ladder lesson of the module may take the track',
  10: 'the Raspberry Pi Pico has no network interface, and the ESP32-S3 firmware of the course configures no Wi-Fi credentials, Modbus TCP server or MQTT broker address',
  11: 'the capstone reads five digital inputs (Start, Stop, EStop, Part, Reset) and the learner boards have four',
};

describe('the hardware track of the course reaches every module that offers it (LRN-011, LRN-013)', () => {
  it('has a hardware lesson in every module whose tracks include hardware, or a stated reason why not', () => {
    const { course } = loadCourse();
    const packages = loadLessonPackages().packages;
    const missing = course!.modules
      .filter((module) => module.tracks.includes('hardware'))
      .filter((module) => !packages.some((lesson) => lesson.manifest.module === module.id && lesson.manifest.tracks.includes('hardware')))
      .map((module) => module.id);
    expect(missing).toEqual(Object.keys(MODULES_WITHOUT_A_HARDWARE_LESSON).map(Number));
  });

  it('gives each lesson without the hardware track a reason that says why, in both languages', () => {
    for (const lesson of loadLessonPackages().packages.filter((item) => !item.manifest.tracks.includes('hardware'))) {
      const reason = lesson.manifest.unsupported.hardware!.reason;
      // "A recorded trace and a wiring page do not exist yet" stopped being true when the hardware track arrived.
      expect({ lesson: lesson.id, stale: /yet|todavía|aún/i.test(`${reason.en} ${reason.es}`) }).toEqual({ lesson: lesson.id, stale: false });
    }
  });
});

describe('the tolerances of a board check (LRN-024)', () => {
  it('never ask a board to be more precise than one scan of the scenario', () => {
    for (const lesson of loadLessonPackages().packages.filter((item) => item.manifest.hardware)) {
      expect({ lesson: lesson.id, atLeastOneScan: lesson.manifest.hardware!.tolerances.timeMs >= lesson.scenario.tickMs }).toEqual({ lesson: lesson.id, atLeastOneScan: true });
    }
  });
});
