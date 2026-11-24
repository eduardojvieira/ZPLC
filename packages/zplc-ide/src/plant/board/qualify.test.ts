import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { LESSON_INDEX } from '../../generated/lessonIndex';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import { PLANT_PULSES } from '../../plants/plantPulses';
import { LEARNER_BOARDS, qualificationTable, qualify, type LinkEvidence, type QualificationSubject } from './qualify';

const run = (board: string, level: LinkEvidence['level'], worstGapMs: number, frameMs = 20): LinkEvidence => ({
  level,
  board,
  transport: 'usb-serial',
  run: { frame_ms: frameMs },
  measurements: { gap_ms: { max: worstGapMs } },
});
const both = (level: LinkEvidence['level'], worstGapMs: number) => LEARNER_BOARDS.map((board) => run(board, level, worstGapMs));

const VALIDATOR = resolve(import.meta.dir, '../../../../../tools/hil/validate_plant_io_evidence.py');
/** The bench runs of `dir` at `frameMs` that the evidence validator accepts at level hil: a refused file never qualifies a scene. */
function benchRuns(dir: string, frameMs: number): LinkEvidence[] {
  return readdirSync(dir)
    .filter((name) => /^plant-io-.*\.json$/.test(name) && name !== 'plant-io-qualification.json' && !name.endsWith('.schema.json'))
    .map((name) => ({ path: join(dir, name), run: JSON.parse(readFileSync(join(dir, name), 'utf8')) as LinkEvidence }))
    .filter(({ run }) => run.level === 'hil' && run.run?.frame_ms === frameMs)
    .filter(({ path }) => Bun.spawnSync(['python3', '-B', VALIDATOR, '--level', 'hil', path]).exitCode === 0)
    .map(({ run }) => run);
}

describe('qualify (R-M6-8, LNK-014)', () => {
  it('a scene whose pulse is above worstGap + scan qualifies', () => {
    expect(qualify({ shortestPulseMs: 200, scanMs: 10 }, both('hil', 25))).toEqual({ qualifies: true });
    expect(qualify({ shortestPulseMs: 35, scanMs: 10 }, both('hil', 25))).toEqual({ qualifies: true });
  });

  it('a scene below it does not and the reason names the three numbers in English and Spanish', () => {
    const result = qualify({ shortestPulseMs: 30, scanMs: 10 }, both('hil', 25.4));
    expect(result.qualifies).toBe(false);
    if (result.qualifies) return;
    for (const text of [result.reason.en, result.reason.es]) {
      expect(text).toContain('25.4 ms');
      expect(text).toContain('30 ms');
      expect(text).toContain('10 ms');
      expect(text).toContain(LEARNER_BOARDS[0]);
    }
    expect(result.reason.en).toContain('worst gap');
    expect(result.reason.es).toContain('peor intervalo');
  });

  it('a fake or native-sim evidence level never qualifies', () => {
    for (const level of ['fake', 'native-sim', 'host', 'qemu', 'target-build'] as const) {
      const result = qualify({ shortestPulseMs: 5000, scanMs: 10 }, both(level, 1));
      expect(result.qualifies).toBe(false);
      if (!result.qualifies) {
        expect(result.reason.en).toContain(level);
        expect(result.reason.es).toContain(level);
      }
    }
  });

  it('both-boards rule: one board failing closes the scene', () => {
    const [first, second] = LEARNER_BOARDS;
    const scene = { shortestPulseMs: 100, scanMs: 10 };
    const failing = qualify(scene, [run(first, 'hil', 20), run(second, 'hil', 95)]);
    expect(failing.qualifies).toBe(false);
    if (!failing.qualifies) expect(failing.reason.en).toContain(second);
    // the worst run of a board decides, whatever the order of the files
    expect(qualify(scene, [run(first, 'hil', 20), run(second, 'hil', 20), run(second, 'hil', 95)]).qualifies).toBe(false);
    // a board with no evidence at all closes the scene, and the reason names it
    const missing = qualify(scene, [run(first, 'hil', 20)]);
    expect(missing.qualifies).toBe(false);
    if (!missing.qualifies) expect(missing.reason.es).toContain(second);
    // evidence of another transport or another board does not count
    const elsewhere = qualify(scene, [
      run(first, 'hil', 20),
      { ...run(second, 'hil', 20), transport: 'tcp' },
      run('nucleo_h743zi', 'hil', 1),
    ]);
    expect(elsewhere.qualifies).toBe(false);
  });
});

/**
 * The provisional table of which scenes and 2.0 plants could run against a board (S5, G10). Until a person records the HIL
 * runs (H8) it is made from the fake board of Studio's tests, which answers every frame at once: the worst gap it shows is the
 * frame period, 20 ms. `ZPLC_UPDATE_GOLDEN=1 bun test src/plant/board/qualify.test.ts` writes it again; with HIL files in the
 * evidence folder it is made from their runs at the bench's default frame period instead.
 */
describe('the qualification table', () => {
  const ide = resolve(import.meta.dir, '../../..');
  const evidenceDir = resolve(ide, '../../specs/012-zplc-2-1-plant-simulation/evidence');
  const file = join(evidenceDir, 'plant-io-qualification.json');
  const FRAME_MS = 20;
  const FAKE: LinkEvidence[] = LEARNER_BOARDS.map((board) => run(board, 'fake', FRAME_MS, FRAME_MS));
  const hil = benchRuns(evidenceDir, FRAME_MS);
  const evidence = hil.length > 0 ? hil : FAKE;

  it('takes only the hil runs at the frame period that validate_plant_io_evidence.py accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qualify-'));
    try {
      const stopped = { ...run(LEARNER_BOARDS[0], 'hil', 0), run: { frames: 5000, frame_ms: FRAME_MS, timeout_ms: 500 } };
      writeFileSync(join(dir, 'plant-io-esp32s3-usb-serial.json'), JSON.stringify(stopped));
      expect(benchRuns(dir, FRAME_MS)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The scan of a subject is the slowest task of the lesson solutions that run it (every lesson's scan today is 10 ms).
  const scanOf = (subject: string): number => {
    const intervals = LESSON_INDEX.lessons
      .filter((lesson) => lesson.scene === subject || lesson.plant === subject)
      .flatMap((lesson) => {
        const manifest = JSON.parse(readFileSync(join(ide, 'projects', lesson.solution.project, 'zplc.json'), 'utf8')) as {
          tasks: { interval_ms?: number }[];
        };
        return manifest.tasks.map((task) => task.interval_ms ?? 0);
      });
    return Math.max(0, ...intervals);
  };
  const pulseOf = (dir: string): number | undefined =>
    (JSON.parse(readFileSync(join(ide, dir, 'scene.json'), 'utf8')) as { shortestPulseMs?: number }).shortestPulseMs;

  it('every scene manifest in plant-scenes has a pulse or the test names it', () => {
    const shipped = readdirSync(join(ide, 'plant-scenes'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(shipped.length).toBe(SCENE_INDEX.length);
    expect(shipped.filter((entry) => !(Number(pulseOf(`plant-scenes/${entry.name}`)) > 0)).map((entry) => entry.name)).toEqual([]);
  });

  it('is the one the scenes, the 2.0 plants and the evidence give, and offers no scene before HIL evidence exists', () => {
    const subjects: QualificationSubject[] = [
      ...SCENE_INDEX.map((scene) => ({
        id: scene.id,
        kind: 'scene' as const,
        shortestPulseMs: pulseOf(scene.dir)!,
        scanMs: scanOf(scene.id),
      })),
      ...Object.entries(PLANT_PULSES).map(([id, shortestPulseMs]) => ({ id, kind: 'plant' as const, shortestPulseMs, scanMs: scanOf(id) })),
    ];
    for (const subject of subjects) expect(subject.scanMs, subject.id).toBeGreaterThan(0);
    const table = qualificationTable(subjects, evidence);
    const text = `${JSON.stringify(table, null, 2)}\n`;
    if (process.env.ZPLC_UPDATE_GOLDEN === '1') writeFileSync(file, text);
    expect(readFileSync(file, 'utf8')).toBe(text);
    if (hil.length === 0) {
      expect(table.level).toBe('fake');
      expect(table.provisional).toBe(true);
      expect(table.subjects.filter((subject) => subject.qualifies)).toEqual([]);
    }
  });
});
