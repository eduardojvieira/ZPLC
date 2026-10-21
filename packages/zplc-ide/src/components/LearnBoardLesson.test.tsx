// The hardware surface of a lesson for the chosen board (LRN-013, LRN-014, LRN-016): the wiring as a diagram and as text,
// the pin map of the lesson's channels, the voltage limit, the kit list, the firmware, and the check on the board.
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { wiringCard } from '../boards/wiring/render';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { LEARNER_KIT, learnerBoardOf } from '../learn/learnerBoards';
import type { BoardCheckStep } from '../learn/boardCheck';
import { auditMarkup } from '../ui/audit';
import type { LearnBoardCheckViewProps } from './LearnBoardCheck';

// The check reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
  getFileContent: () => null,
}));
const { LearnBoardCheckView } = await import('./LearnBoardCheck');
const { LearnBoardLessonView } = await import('./LearnBoardLesson');

const WIRING = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'verify-my-board')!.hardware!.wiring;
const render = (board: 'rpi-pico-rp2040' | 'esp32-s3-devkitc' | null): string =>
  renderToStaticMarkup(
    <LearnBoardLessonView
      board={board}
      wiringBoard={board ? learnerBoardOf(board)! : null}
      wiring={WIRING}
      kit={LEARNER_KIT}
      locale="en"
      onChoose={() => undefined}
      firmware={<p data-firmware>firmware</p>}
      check={<p data-check>check</p>}
    />,
  );
const rows = (out: string): string[] => [...out.matchAll(/<tr data-learn-pin="([^"]+)"/g)].map((match) => match[1]!);

describe('the lesson on the chosen board (LRN-013, LRN-014)', () => {
  it('LRN-013 asks for a board before it shows any wiring', () => {
    const out = render(null);
    expect(out).toContain('Choose your board to see its wiring and to check this lesson on it.');
    expect(out).not.toContain('data-learn-wiring=');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('LRN-014 draws the wiring for the chosen board, lists it in words and maps each part to its pin', () => {
    const pico = render('rpi-pico-rp2040');
    expect(pico).toContain('data-learn-wiring="rpi-pico-rp2040"');
    expect(pico).toMatch(/<img[^>]+src="data:image\/svg\+xml[^"]+"[^>]+alt="Wiring diagram of this lesson on the Raspberry Pi Pico/);
    for (const line of wiringCard(learnerBoardOf('rpi-pico-rp2040')!, WIRING, 'en'))
      expect(pico).toContain(`<li>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</li>`);
    // The Pico wires its on-board LED too; the ESP32-S3 has no such part.
    expect(rows(pico)).toEqual(['led', 'onboard-led', 'button']);
    expect(rows(render('esp32-s3-devkitc'))).toEqual(['led', 'button']);
    expect(pico).toContain('data-firmware');
    expect(pico).toContain('data-check');
    expect(auditMarkup(pico)).toEqual([]);
  });

  it('LRN-016 states the voltage limit and lists the parts of the whole course', () => {
    const out = render('esp32-s3-devkitc');
    expect(out).toContain('Read the voltage limit before you wire');
    for (const sentence of LEARNER_KIT.voltageLimit.en)
      expect(out).toContain(sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    expect(out.match(/<li data-learn-bom-item/g)).toHaveLength(LEARNER_KIT.bom.length);
  });
});

const STEPS: BoardCheckStep[] = [
  { atMs: 0, signals: [{ signal: 'P.Button', value: false, channel: 'DI0', part: 'Test button', kind: 'button' }] },
  { atMs: 200, signals: [{ signal: 'P.Button', value: true, channel: 'DI0', part: 'Test button', kind: 'button' }] },
];
const check = (over: Partial<LearnBoardCheckViewProps>): string =>
  renderToStaticMarkup(
    <LearnBoardCheckView
      readiness={{ ready: true }}
      board="rpi-pico-rp2040"
      missing={[]}
      steps={STEPS}
      step={null}
      outcome={null}
      expectations={[]}
      onRun={() => undefined}
      onCancel={() => undefined}
      {...over}
    />,
  );

describe('the check on the board waits for the learner (LRN-015, LRN-024)', () => {
  it('LRN-015 disables Check on board and says what is missing until the learner connected and started the program', () => {
    const out = check({ readiness: { ready: false, block: 'not-connected', reported: null } });
    expect(out).toMatch(/<button(?=[^>]*data-learn-board-check="true")(?=[^>]*disabled="")[^>]*>/);
    expect(out).toContain('Connect to your board first, from the toolbar.');
    expect(check({ readiness: { ready: false, block: 'not-running', reported: null } })).toContain(
      'Deploy the lesson program to your board and run it first, from the toolbar.',
    );
    expect(auditMarkup(out)).toEqual([]);
  });

  it('LRN-013 names a connected board that is not the one the learner chose', () => {
    expect(check({ readiness: { ready: false, block: 'wrong-board', reported: 'esp32-s3-devkitc' } })).toContain(
      'The connected board is the ESP32-S3-DevKitC-1, not the Raspberry Pi Pico you chose.',
    );
  });

  it('LRN-024 guides the learner step by step while it records', () => {
    const out = check({ step: 1 });
    expect(out).toContain('Step 2 of 2: press and hold Test button (DI0) now');
    expect(out).toMatch(/<li aria-current="step"[^>]*>press and hold Test button \(DI0\) now<\/li>/);
    expect(out).toContain('data-learn-board-check-cancel');
  });

  it('LRN-026 shows the result of the run, and the failed assertions with their time, values and trace link', () => {
    const failure = {
      index: 0,
      kind: 'AT',
      atMs: 1500,
      expected: { 'P.Led': true },
      observed: { 'P.Led': false },
      trace: {
        scenarioId: 'S',
        traceSha256: 'c'.repeat(64),
        cursor: 12,
        atMs: 1500,
        uri: `zplc://runtime/snapshot/S/12/${'c'.repeat(64)}`,
      },
    };
    const record = {
      schemaVersion: 1,
      lessonId: 'verify-my-board',
      lessonVersion: 1,
      track: 'hardware',
      scenarioId: 'S',
      scenarioSha256: 'a'.repeat(64),
      programSha256: 'b'.repeat(64),
      runtimeVersion: '2.0.0',
      time: '2026-10-20T10:00:00.000Z',
    } as const;
    const failed = check({
      outcome: {
        kind: 'graded',
        record: { ...record, result: 'failed', assertions: { total: 2, passed: 1 }, failedAssertions: [failure] },
      },
      expectations: [{ kind: 'AT', atMs: 750, condition: { 'P.Led': true } }],
    });
    expect(failed).toContain('Not passed on hardware: 1 of 2 assertions held.');
    expect(failed).toContain('AT 750 ms: P.Led = true · at 1500 ms expected P.Led = true; observed P.Led = false');
    expect(failed).toContain(`zplc://runtime/snapshot/S/12/${'c'.repeat(64)}`);
    expect(
      check({
        outcome: { kind: 'graded', record: { ...record, result: 'passed', assertions: { total: 2, passed: 2 }, failedAssertions: [] } },
      }),
    ).toContain('Passed on hardware: 2 of 2 assertions held.');
    expect(check({ outcome: { kind: 'cancelled' } })).toContain('Check cancelled. Nothing was recorded.');
  });
});
