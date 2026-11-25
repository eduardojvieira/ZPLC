import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseReading } from '../../src/learn/readingMarkdown';
import { crossings, layoutLabels, layoutProblems, type LabelBox } from './labelLayout';
import { LOCALES, machineRows, partLabels, readMachine, SCENES_DIR, signalTable, type Machine } from './machinePage';
import { staleTables, tablesOf } from './signal-table';

/** The machine page of a plant lesson (course review L8): the signal table and the labels, from the scene and its plant map. */
const SCENES = readdirSync(SCENES_DIR).sort();

describe('signal table', () => {
  it('has one row per wired signal of each part, in the order of the scene, with what the part is on its first row', () => {
    const { rows, problems } = machineRows(readMachine('belt-to-sensor'));
    expect(problems).toEqual([]);
    expect(signalTable(rows, 'en')).toBe(
      [
        '| Part | What it is in a real plant | Signal | PLC variable | Direction | Type | Meaning |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| `Belt1` (Belt conveyor) | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines. | ' +
          '`Belt1.run` | `Run` | PLC output | BOOL | TRUE runs the belt forward. |',
        '| `Emitter1` (Item emitter) | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that ' +
          'releases one item. | `Emitter1.emit` | `Emit` | PLC output | BOOL | Each rising edge releases one item onto the line. |',
        '| `EyeFar` (Diffuse optical sensor) | A photoelectric sensor that sends out light and sees it bounce back off an object in ' +
          'front of it. | `EyeFar.detect` | `EyeFar` | PLC input | BOOL | TRUE while an object is in the beam. |',
        '| `StartButton` (Push button) | A button on the operator panel that is pressed only while a finger holds it. | ' +
          '`StartButton.pressed` | `Start` | PLC input | BOOL | TRUE while the button is held down. |',
        '',
      ].join('\n'),
    );
  });

  it('writes a numeric range and the second row of a part without its description, in Spanish', () => {
    const lines = signalTable(machineRows(readMachine('tank-level-control')).rows, 'es').split('\n');
    expect(lines[0]).toBe('| Pieza | Qué es en una planta real | Señal | Variable del PLC | Dirección | Tipo | Significado |');
    expect(lines[2]).toContain(
      '| `Tank1.level` | `LevelRaw` | Entrada del PLC | INT, 0 a 27648 = 0 a 1 m | El nivel del líquido en el tanque. |',
    );
    expect(lines[3]).toStartWith('| `Tank1` (Tanque) |  | `Tank1.fill` | `FillCmd` | Salida del PLC | REAL, 0 a 100 % |');
  });

  it('keeps a part the plant map does not wire, as not wired to the PLC', () => {
    const table = signalTable(machineRows(readMachine('stacker-crane-warehouse')).rows, 'en');
    expect(table).toContain('| `OutBin` (Item remover) | Stands for whatever takes items away at the end of the line');
    expect(table).toContain('| — | — | — | — | Not wired to the PLC. |');
  });

  it('describes every part and every wired signal of the 21 scenes, and each table is a valid reading page in both languages', () => {
    expect(SCENES.length).toBe(21);
    const { files, problems } = tablesOf(SCENES);
    expect(problems).toEqual([]);
    expect(files.length).toBe(42);
    for (const file of files) {
      const parsed = parseReading(file.text);
      expect({ file: file.path, errors: parsed.errors, blocks: parsed.blocks.map((block) => block.type) }).toEqual({
        file: file.path,
        errors: [],
        blocks: ['table'],
      });
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
      expect(staleTables(files, out)).toEqual(['belt-to-sensor/signals.es.md']);
      const stale = cli('--check');
      expect(stale.exitCode).toBe(1);
      expect(stale.stderr.toString()).toContain('stale or missing: ');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 30_000);
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
});
