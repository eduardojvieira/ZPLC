import { afterEach, describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { programWiringProblems } from '../boards/wiring/wiring';
import { BOARDS, WIRING } from '../boards/wiring/wiring.fixtures';
import { LESSONS_DIRECTORY, buildIndex, loadCourse, loadLearnerBoards, loadLessonPackages, programAddresses, PROJECTS_DIRECTORY } from './lessonPackageFiles';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

/** A copy of the lessons in which blink-structured-text (Enable on %I0.0, Lamp on %Q0.0) takes the hardware track. */
function lessonsWithHardware(parts: unknown[] | null): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-hw-lessons-'));
  temporary.push(root);
  cpSync(LESSONS_DIRECTORY, root, { recursive: true });
  const file = join(root, 'blink-structured-text', 'lesson.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, JSON.stringify({ ...manifest, tracks: ['simulation', 'hardware'], unsupported: {}, hardware: { wiring: 'wiring.json', tolerances: { timeMs: 50, analogPercent: 5 } } }));
  if (parts) writeFileSync(join(root, 'blink-structured-text', 'wiring.json'), JSON.stringify({ schemaVersion: 1, parts }));
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
    expect(programWiringProblems(WIRING, BOARDS, ['%QX0.0', '%QX0.1', '%IX0.0', '%IX0.1', '%IX0.3', '%IW4'], [])).toEqual([]);
    expect(programWiringProblems(WIRING, BOARDS, ['%QX0.0', '%QX0.1', '%IX0.0', '%IX0.3', '%IW4'], [])).toEqual([
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
