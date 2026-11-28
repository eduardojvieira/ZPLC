import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseReading } from '../../src/learn/readingMarkdown';
import { crossings, layoutLabels, layoutProblems, type LabelBox } from './labelLayout';
import * as labelLayout from './labelLayout';
import * as labelShot from './labelShot';
import { LOCALES, machineRows, partLabels, readMachine, SCENES_DIR, signalTable, type Machine } from './machinePage';
import { PART_TEXT } from './machineText';
import { staleTables, tablesOf } from './signal-table';

/** The machine page of a plant lesson (course review L8): the signal table and the labels, from the scene and its plant map. */
const SCENES = readdirSync(SCENES_DIR).sort();
const LESSONS_DIR = resolve(import.meta.dir, '../../lessons');

describe('signal table', () => {
  it('writes a 3-column parts table and a 4-column signals table in scene order (CP-01)', () => {
    const { rows, problems } = machineRows(readMachine('belt-to-sensor'));
    expect(problems).toEqual([]);
    expect(signalTable(rows, 'en')).toBe(
      [
        '| Part | Kind | What it is in a real plant |',
        '| --- | --- | --- |',
        '| `Belt1` | Belt conveyor | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. |',
        '| `Emitter1` | Item emitter | ' +
          'Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |',
        '| `EyeFar` | Diffuse optical sensor | ' +
          'A photoelectric sensor that sends out light and sees it bounce back off an object in front of it. |',
        '| `StartButton` | Push button | A button on the operator panel that is pressed only while a finger holds it. |',
        '',
        '| Variable | Signal | Direction & type | Meaning |',
        '| --- | --- | --- | --- |',
        '| `Run` | `Belt1.run` | PLC output · BOOL | TRUE runs the belt forward. |',
        '| `Emit` | `Emitter1.emit` | PLC output · BOOL | Each rising edge releases one item onto the line. |',
        '| `EyeFar` | `EyeFar.detect` | PLC input · BOOL | TRUE while an object is in the beam. |',
        '| `Start` | `StartButton.pressed` | PLC input · BOOL | TRUE while the button is held down. |',
        '',
      ].join('\n'),
    );
  });

  it('writes Elemento (not Pieza), numeric ranges, and one part row for multi-signal parts in Spanish (CP-01, CP-04)', () => {
    const table = signalTable(machineRows(readMachine('tank-level-control')).rows, 'es');
    const lines = table.split('\n');
    expect(lines[0]).toBe('| Elemento | Tipo | Qué es en una planta real |');
    expect(lines.filter((line) => line.startsWith('| `Tank1` |'))).toHaveLength(1);
    expect(table).toContain('| Variable del PLC | Señal | Dirección y tipo | Significado |');
    expect(table).toContain(
      '| `LevelRaw` | `Tank1.level` | Entrada del PLC · INT, 0 a 27648 = 0 a 1 m | El nivel del líquido en el tanque. |',
    );
    expect(table).toContain('| `FillCmd` | `Tank1.fill` | Salida del PLC · REAL, 0 a 100 % |');
  });

  it('keeps an unwired part in both the parts table and the signals table without repeating prose (CP-01, CP-04)', () => {
    const en = signalTable(machineRows(readMachine('stacker-crane-warehouse')).rows, 'en');
    expect(en).toContain('| `OutBin` | Item remover | Stands for whatever takes items away at the end of the line');
    expect(en).toContain('| — | `OutBin` | — | Not wired to the PLC. |');
    const es = signalTable(machineRows(readMachine('stacker-crane-warehouse')).rows, 'es');
    expect(es).toContain('| `OutBin` | Retirador de piezas | Representa lo que retira las piezas al final de la línea');
    expect(es).toContain('| — | `OutBin` | — | No está cableado al PLC. |');
  });

  it('describes every part and signal of the 21 scenes with valid reading tables of at most 4 columns in both languages (CP-01)', () => {
    expect(SCENES.length).toBe(21);
    const { files, problems } = tablesOf(SCENES);
    expect(problems).toEqual([]);
    expect(files.length).toBe(42);
    for (const file of files) {
      const parsed = parseReading(file.text);
      expect({ file: file.path, errors: parsed.errors, blocks: parsed.blocks.map((block) => block.type) }).toEqual({
        file: file.path,
        errors: [],
        blocks: ['table', 'table'],
      });
      for (const block of parsed.blocks) {
        if (block.type === 'table') expect(block.header.length).toBeLessThanOrEqual(4);
      }
      if (file.path.endsWith('.es.md')) {
        expect(file.text).not.toContain('| Pieza |');
        expect(file.text).not.toMatch(/\bbot[oó]n(?:es)?\b/i);
        expect(file.text).not.toMatch(/\bfin de carrera\b/i);
      }
    }
  });

  it('names what a scene lacks: a part kind without text, a signal without meaning, a mapped signal of no part', () => {
    const machine: Machine = {
      id: 'made-up',
      scene: {
        name: 'Made up',
        parts: [
          { id: 'w', part: 'widget', name: 'Widget1' },
          { id: 'b', part: 'belt', name: 'Belt1' },
        ],
      },
      map: {
        signals: {
          'Belt1.runReverse': { direction: 'command', type: 'BOOL', point: 'P.Back' },
          'Ghost.on': { direction: 'command', type: 'BOOL', point: 'P.On' },
        },
      },
    };
    expect(machineRows(machine).problems).toEqual([
      'made-up: Ghost.on names no part of the scene',
      'made-up: part kind widget (Widget1) has no text in machineText.ts',
      'made-up: part kind widget (Widget1) is not in the catalogue',
      'made-up: signal Belt1.runReverse of belt has no meaning in machineText.ts',
    ]);
  });

  it('finds a table that is missing or differs from what the scene gives now', () => {
    const out = mkdtempSync(join(tmpdir(), 'zplc-signal-table-'));
    try {
      const { files } = tablesOf(['belt-to-sensor']);
      expect(staleTables(files, out)).toEqual([join('belt-to-sensor', 'signals.en.md'), join('belt-to-sensor', 'signals.es.md')]);
      const cli = (...args: string[]) =>
        Bun.spawnSync([process.execPath, join(import.meta.dir, 'signal-table.ts'), '--out', out, '--scenes', 'belt-to-sensor', ...args]);
      expect(cli().exitCode).toBe(0);
      expect(cli('--check').exitCode).toBe(0);
      expect(staleTables(files, out)).toEqual([]);
      writeFileSync(join(out, 'belt-to-sensor', 'signals.es.md'), files[1]!.text.replace('Entrada del PLC', 'Entrada'));
      expect(staleTables(files, out)).toEqual([join('belt-to-sensor', 'signals.es.md')]);
      const stale = cli('--check');
      expect(stale.exitCode).toBe(1);
      expect(stale.stderr.toString()).toContain('stale or missing: ');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('machine Spanish terminology and pilot reading checks (CP-04, CP-05)', () => {
  it('uses pulsador (not botón) and final de carrera (not fin de carrera) across machineText.ts (CP-04)', () => {
    for (const [kind, text] of Object.entries(PART_TEXT)) {
      expect({ kind, text: text.plant.es }).toEqual({
        kind,
        text: expect.not.stringMatching(/\bbot[oó]n(?:es)?\b|\bfin de carrera\b/i),
      });
      for (const [signal, meaning] of Object.entries(text.signals)) {
        expect({ kind, signal, text: meaning.es }).toEqual({
          kind,
          signal,
          text: expect.not.stringMatching(/\bbot[oó]n(?:es)?\b|\bfin de carrera\b/i),
        });
      }
    }
  });

  it('keeps pilot readings path-independent, <= 4 table columns, and free of Spanish glossary drifts (CP-01, CP-04, CP-05)', () => {
    for (const lessonId of ['plant-belt-to-sensor', 'sfc-fill-mix-sequence'] as const) {
      for (const locale of LOCALES) {
        const md = readFileSync(join(LESSONS_DIR, lessonId, `reading.${locale}.md`), 'utf8');
        const parsed = parseReading(md);
        expect({ lessonId, locale, errors: parsed.errors }).toEqual({ lessonId, locale, errors: [] });
        for (const block of parsed.blocks) {
          if (block.type === 'table') expect(block.header.length).toBeLessThanOrEqual(4);
        }
        expect(md).not.toMatch(/Ladder lesson|in Ladder diagram|in the motor lesson/i);
        expect(md).not.toMatch(/diagrama de escalera|lección del motor|lección de bits de paso/i);
        if (locale === 'es') {
          expect(md).not.toContain('| Pieza |');
          expect(md).not.toMatch(/\bbot[oó]n(?:es)?\b/i);
          expect(md).not.toMatch(/\bfin de carrera\b/i);
          expect(md).not.toContain('name: Memory');
        }
      }
    }
  });
});

describe('part labels', () => {
  it('give each part its name and kind, and each wired signal as the variable with an arrow that says which way it goes', () => {
    const rows = machineRows(readMachine('belt-to-sensor')).rows;
    expect(partLabels(rows, 'en')).toEqual([
      { id: 'belt', title: 'Belt1 · Belt conveyor', lines: ['Run → run'] },
      { id: 'emitter', title: 'Emitter1 · Item emitter', lines: ['Emit → emit'] },
      { id: 'eye-far', title: 'EyeFar · Diffuse optical sensor', lines: ['EyeFar ← detect'] },
      { id: 'start', title: 'StartButton · Push button', lines: ['Start ← pressed'] },
    ]);
    expect(partLabels(rows, 'es').map((label) => label.title)).toEqual([
      'Belt1 · Cinta transportadora',
      'Emitter1 · Emisor de piezas',
      'EyeFar · Sensor óptico difuso',
      'StartButton · Pulsador',
    ]);
    for (const locale of LOCALES) expect(partLabels(rows, locale).flatMap((label) => label.lines)).toHaveLength(4);
  });
});

describe('label layout', () => {
  const frame = { w: 1280, h: 720 };
  const box = (id: string, anchor: [number, number] | null, h = 40, w = 180): LabelBox => ({ id, anchor, w, h });

  it('keeps every label beside the frame, inside the image and clear of the others, even when the parts crowd one spot', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => box(`p${i}`, [300 + 10 * i, 400], 40 + 18 * (i % 3)));
    const layout = layoutLabels(crowd, frame);
    expect(layoutProblems(layout)).toEqual([]);
    expect(layout.labels).toHaveLength(12);
    expect(layout.height).toBe(720);
    expect(new Set(layout.labels.map((label) => label.side))).toEqual(new Set(['left', 'right']));
  });

  it('makes the image taller when both columns are full, and is the same for the same input', () => {
    const many = Array.from({ length: 30 }, (_, i) => box(`p${i}`, [i % 2 ? 200 : 1000, 20 * i], 80));
    const layout = layoutLabels(many, frame);
    expect(layout.height).toBeGreaterThan(720);
    expect(layoutProblems(layout)).toEqual([]);
    expect(layoutLabels(many, frame)).toEqual(layout);
  });

  it('swaps two labels whose leader lines would cross', () => {
    // Sorted by height the labels are top, far, near: top pushes far down, and near's leader, below it, would climb across far's.
    const parts = [box('top', [500, 395]), box('far', [600, 400]), box('near', [100, 405])];
    const layout = layoutLabels(parts, frame);
    const y = (id: string) => layout.labels.find((label) => label.id === id)!.y;
    expect(y('top')).toBeLessThan(y('near'));
    expect(y('near')).toBeLessThan(y('far'));
    expect(crossings(layout)).toBe(0);
    expect(layoutProblems(layout)).toEqual([]);
  });

  it('lays out a part with no position without a leader line', () => {
    const layout = layoutLabels([box('a', [100, 100]), box('hidden', null)], frame);
    expect(layout.labels.find((label) => label.id === 'hidden')!.leader).toBeNull();
    expect(layoutProblems(layout)).toEqual([]);
  });

  it('keeps label, title, header, and legend text >= 12 px at reading-column width across all 21 scenes in EN and ES (CP-02)', () => {
    const {
      FRAME_WIDTH,
      FRAME_HEIGHT,
      LINE_FONT_PX,
      TITLE_FONT_PX,
      HEADER_FONT_PX,
      LEGEND_FONT_PX,
      MAX_LAYOUT_WIDTH,
      MIN_DISPLAY_TEXT_PX,
      COMPACT_COLUMN_WIDTH_PX,
      READING_COLUMN_WIDTH_PX,
      effectiveLabelTextPx,
      labelBoxesForParts,
    } = labelLayout as typeof labelLayout & {
      FRAME_WIDTH: number;
      FRAME_HEIGHT: number;
      LINE_FONT_PX: number;
      TITLE_FONT_PX: number;
      HEADER_FONT_PX: number;
      LEGEND_FONT_PX: number;
      MAX_LAYOUT_WIDTH: number;
      MIN_DISPLAY_TEXT_PX: number;
      COMPACT_COLUMN_WIDTH_PX: number;
      READING_COLUMN_WIDTH_PX: number;
      effectiveLabelTextPx: (layoutWidth: number, columnWidthPx?: number, fontPx?: number) => number;
      labelBoxesForParts: (
        labels: Array<{ id: string; title: string; lines: string[] }>,
        anchors: Record<string, [number, number] | null>,
      ) => LabelBox[];
    };

    expect(typeof effectiveLabelTextPx).toBe('function');
    expect(typeof labelBoxesForParts).toBe('function');
    expect((labelShot as Record<string, unknown>).effectiveLabelTextPx).toBe(effectiveLabelTextPx);
    expect((labelShot as Record<string, unknown>).LINE_FONT_PX).toBe(LINE_FONT_PX);

    for (const id of SCENES) {
      const { rows } = machineRows(readMachine(id));
      for (const locale of LOCALES) {
        const labels = partLabels(rows, locale);
        const anchors = Object.fromEntries(
          labels.map((label, i) => [
            label.id,
            [Math.round(((i + 1) / (labels.length + 1)) * FRAME_WIDTH), Math.round((i % 2 === 0 ? 0.3 : 0.7) * FRAME_HEIGHT)] as [
              number,
              number,
            ],
          ]),
        );
        const boxes = labelBoxesForParts(labels, anchors);
        const layout = (
          layoutLabels as (b: LabelBox[], f: { w: number; h: number }, o?: { maxWidth?: number }) => ReturnType<typeof layoutLabels>
        )(boxes, { w: FRAME_WIDTH, h: FRAME_HEIGHT }, { maxWidth: MAX_LAYOUT_WIDTH });
        expect({ id, locale, problems: layoutProblems(layout) }).toEqual({ id, locale, problems: [] });
        expect(layout.width).toBeLessThanOrEqual(MAX_LAYOUT_WIDTH);
        expect(effectiveLabelTextPx(layout.width, COMPACT_COLUMN_WIDTH_PX, LINE_FONT_PX)).toBeGreaterThanOrEqual(MIN_DISPLAY_TEXT_PX);
        expect(effectiveLabelTextPx(layout.width, READING_COLUMN_WIDTH_PX, LINE_FONT_PX)).toBeGreaterThanOrEqual(MIN_DISPLAY_TEXT_PX);
        expect(effectiveLabelTextPx(layout.width, COMPACT_COLUMN_WIDTH_PX, TITLE_FONT_PX)).toBeGreaterThanOrEqual(MIN_DISPLAY_TEXT_PX);
        expect(effectiveLabelTextPx(layout.width, COMPACT_COLUMN_WIDTH_PX, HEADER_FONT_PX)).toBeGreaterThanOrEqual(MIN_DISPLAY_TEXT_PX);
        expect(effectiveLabelTextPx(layout.width, COMPACT_COLUMN_WIDTH_PX, LEGEND_FONT_PX)).toBeGreaterThanOrEqual(MIN_DISPLAY_TEXT_PX);
      }
    }
  });
});
