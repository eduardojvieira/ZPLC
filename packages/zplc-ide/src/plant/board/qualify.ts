/**
 * @file qualify.ts
 * @brief Which scenes can run against a board, decided from the measured latency of the plant link (R-M6-8, LNK-014).
 *
 * A sensor pulse shorter than the worst gap between two exchanges can fall between two frames, and one scan of margin covers
 * the latch: a scene is safe on a board when `shortestPulseMs >= worstGapMs + scanMs`. Only a run a person recorded at the
 * bench (level `hil`) can qualify a scene; a fake board, the native simulator or any other level never does (P6, G10).
 */

/** The learner boards (D-17). Open question 4, default A: a scene must qualify on both of them over USB serial. */
export const LEARNER_BOARDS = ['esp32s3_devkitc', 'rpi_pico'] as const;
export const QUALIFYING_TRANSPORT = 'usb-serial';

/** The levels of plant-io.schema.json, and `fake`: the fake board of Studio's tests. */
export type EvidenceLevel = 'fake' | 'host' | 'native-sim' | 'qemu' | 'target-build' | 'hil';

/** What the rule reads of a plant I/O evidence file (plant-io.schema.json, judged by validate_plant_io_evidence.py). */
export interface LinkEvidence {
  level: EvidenceLevel;
  board: string;
  transport: string;
  run: { frame_ms: number };
  measurements: { gap_ms: { max: number } };
}

export interface QualificationReason {
  en: string;
  es: string;
}

export type Qualification = { qualifies: true } | { qualifies: false; reason: QualificationReason };

const ms = (value: number): string => `${Number(value.toFixed(1))} ms`;
const closed = (en: string, es: string): Qualification => ({ qualifies: false, reason: { en, es } });

/** R-M6-8 on every learner board; the reason names the board and, when the rule fails, the gap, the pulse and the scan. */
export function qualify(scene: { shortestPulseMs: number; scanMs: number }, evidence: readonly LinkEvidence[]): Qualification {
  const { shortestPulseMs: pulse, scanMs: scan } = scene;
  for (const board of LEARNER_BOARDS) {
    const runs = evidence.filter((run) => run.board === board && run.transport === QUALIFYING_TRANSPORT);
    if (runs.length === 0)
      return closed(
        `No plant I/O run over ${QUALIFYING_TRANSPORT} is recorded for ${board}, so no scene can run against that board yet.`,
        `No hay ninguna ejecución de E/S de planta por ${QUALIFYING_TRANSPORT} registrada para ${board}, ` +
          'así que ninguna escena puede ejecutarse todavía contra esa placa.',
      );
    const bench = runs.filter((run) => run.level === 'hil');
    const level = runs[0]!.level;
    if (bench.length === 0)
      return closed(
        `The plant I/O evidence for ${board} is at level ${level}, not from a board on the bench (hil), so it cannot qualify a scene.`,
        `La evidencia de E/S de planta de ${board} es de nivel ${level}, no de una placa en el banco (hil), ` +
          'así que no puede habilitar una escena.',
      );
    const gap = Math.max(...bench.map((run) => run.measurements.gap_ms.max));
    if (pulse < gap + scan)
      return closed(
        `On ${board} over ${QUALIFYING_TRANSPORT} the worst gap between exchanges is ${ms(gap)} and one scan is ${ms(scan)}: ` +
          `a sensor pulse of ${ms(pulse)} can fall between two frames (it needs at least ${ms(gap + scan)}).`,
        `En ${board} por ${QUALIFYING_TRANSPORT} el peor intervalo entre intercambios es de ${ms(gap)} y un ciclo es de ${ms(scan)}: ` +
          `un pulso de sensor de ${ms(pulse)} puede caer entre dos frames (necesita al menos ${ms(gap + scan)}).`,
      );
  }
  return { qualifies: true };
}

export interface QualificationSubject {
  id: string;
  kind: 'scene' | 'plant';
  shortestPulseMs: number;
  scanMs: number;
}

/** The table of `plant-io-qualification.json`: its level is `hil` only when every run it was made from is a bench run. */
export function qualificationTable(subjects: readonly QualificationSubject[], evidence: readonly LinkEvidence[]) {
  const level: EvidenceLevel = evidence.find((run) => run.level !== 'hil')?.level ?? (evidence.length > 0 ? 'hil' : 'fake');
  return {
    schema: 1,
    level,
    provisional: level !== 'hil',
    comment:
      level === 'hil'
        ? 'Made from the HIL runs a person recorded at the bench (H8).'
        : 'Provisional: made from the fake board of Studio tests, which answers every frame at once. It is not a measurement of ' +
          'any board, and qualify() offers no scene on it (G10, P6). It is made again from the HIL runs (H8).',
    rule: 'R-M6-8: shortestPulseMs >= worstGapMs + scanMs on every learner board over usb-serial; only hil evidence qualifies',
    boards: LEARNER_BOARDS,
    transport: QUALIFYING_TRANSPORT,
    evidence: evidence.map((run) => ({
      board: run.board,
      level: run.level,
      frame_ms: run.run.frame_ms,
      worst_gap_ms: run.measurements.gap_ms.max,
    })),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      kind: subject.kind,
      shortest_pulse_ms: subject.shortestPulseMs,
      scan_ms: subject.scanMs,
      ...qualify(subject, evidence),
    })),
  };
}
