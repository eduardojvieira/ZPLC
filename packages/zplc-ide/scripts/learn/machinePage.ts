/**
 * The machine page of a plant lesson, from the scene and its plant map (course review L8): a 3-column parts table and a 4-column signal
 * table, plus one label per part for the labelled image. signal-table.ts writes the tables, machine-images.ts draws the images; both
 * read the scene files as they are, so neither can drift from them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogue } from '../../src/plant/core/catalogue';
import '../../src/plant/core/plantCore'; // registers the shipped parts in the catalogue
import { PART_TEXT, type Locale, type Text } from './machineText';

export const LOCALES: readonly Locale[] = ['en', 'es'];
export const SCENES_DIR = fileURLToPath(new URL('../../plant-scenes', import.meta.url));

interface Range {
  raw_min: number;
  raw_max: number;
  eng_min: number;
  eng_max: number;
  unit: string;
}
interface Binding {
  direction: 'sensor' | 'command';
  type: string;
  point: string;
  range?: Range;
}
export interface Machine {
  id: string;
  scene: { name: string; parts: Array<{ id: string; part: string; name: string }> };
  map: { signals: Record<string, Binding> };
}
export interface MachineRow {
  part: { id: string; name: string; kind: string; kindName: Text; plant: Text };
  /** Absent for a part the plant map does not wire to the program. */
  signal?: Binding & { name: string; meaning: Text };
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function readMachine(id: string, dir = SCENES_DIR): Machine {
  return {
    id,
    scene: readJson(join(dir, id, 'scene.json')) as Machine['scene'],
    map: readJson(join(dir, id, 'plant-map.json')) as Machine['map'],
  };
}

/**
 * The rows of a scene, in the order of its parts and, for each part, of its signals in the plant map; and what text is missing (a
 * part kind or a signal that machineText.ts does not describe, a mapped signal of no part), so a new part cannot ship without it.
 */
export function machineRows(machine: Machine): { rows: MachineRow[]; problems: string[] } {
  const problems: string[] = [];
  const rows: MachineRow[] = [];
  const names = new Set(machine.scene.parts.map((part) => part.name));
  for (const signal of Object.keys(machine.map.signals))
    if (!names.has(signal.slice(0, signal.indexOf('.')))) problems.push(`${machine.id}: ${signal} names no part of the scene`);
  for (const part of machine.scene.parts) {
    const text = PART_TEXT[part.part];
    const definition = catalogue.get(part.part);
    if (!text) problems.push(`${machine.id}: part kind ${part.part} (${part.name}) has no text in machineText.ts`);
    if (!definition) problems.push(`${machine.id}: part kind ${part.part} (${part.name}) is not in the catalogue`);
    const row = {
      id: part.id,
      name: part.name,
      kind: part.part,
      kindName: definition?.names ?? { en: part.part, es: part.part },
      plant: text?.plant ?? { en: '', es: '' },
    };
    const bound = Object.entries(machine.map.signals).filter(([name]) => name.startsWith(`${part.name}.`));
    if (bound.length === 0) rows.push({ part: row });
    for (const [name, binding] of bound) {
      const meaning = text?.signals[name.slice(part.name.length + 1)];
      if (text && !meaning) problems.push(`${machine.id}: signal ${name} of ${part.part} has no meaning in machineText.ts`);
      rows.push({ part: row, signal: { ...binding, name, meaning: meaning ?? { en: '', es: '' } } });
    }
  }
  return { rows, problems };
}

const WORDS = {
  en: {
    partsHead: ['Part', 'Kind', 'What it is in a real plant'],
    signalsHead: ['Variable', 'Signal', 'Direction & type', 'Meaning'],
    sensor: 'PLC input',
    command: 'PLC output',
    unwired: 'Not wired to the PLC.',
    to: 'to',
  },
  es: {
    partsHead: ['Elemento', 'Tipo', 'Qué es en una planta real'],
    signalsHead: ['Variable del PLC', 'Señal', 'Dirección y tipo', 'Significado'],
    sensor: 'Entrada del PLC',
    command: 'Salida del PLC',
    unwired: 'No está cableado al PLC.',
    to: 'a',
  },
} as const;

/** The program's variable of a plant-map point (`Program.Variable`). */
export const variableOf = (point: string): string => point.slice(point.lastIndexOf('.') + 1);

function typeText(binding: Binding, locale: Locale): string {
  const r = binding.range;
  if (!r) return binding.type;
  const to = WORDS[locale].to;
  const eng = `${r.eng_min} ${to} ${r.eng_max} ${r.unit}`;
  return r.raw_min === r.eng_min && r.raw_max === r.eng_max
    ? `${binding.type}, ${eng}`
    : `${binding.type}, ${r.raw_min} ${to} ${r.raw_max} = ${eng}`;
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');
const markdownTable = (head: readonly string[], body: readonly string[][]): string =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((row) => `| ${row.map(cell).join(' | ')} |`)].join(
    '\n',
  );

/**
 * The machine tables in Markdown, in the subset a lesson reading page accepts (src/learn/readingMarkdown.ts): a 3-column parts table
 * followed by a 4-column signals table, so every table fits a compact reading column without clipping.
 */
export function signalTable(rows: readonly MachineRow[], locale: Locale): string {
  const words = WORDS[locale];
  const seen = new Set<string>();
  const parts: string[][] = [];
  const signals: string[][] = [];
  for (const { part, signal } of rows) {
    if (!seen.has(part.id)) {
      seen.add(part.id);
      parts.push([`\`${part.name}\``, part.kindName[locale], part.plant[locale]]);
    }
    signals.push(
      signal
        ? [
            `\`${variableOf(signal.point)}\``,
            `\`${signal.name}\``,
            `${words[signal.direction]} · ${typeText(signal, locale)}`,
            signal.meaning[locale],
          ]
        : ['—', `\`${part.name}\``, '—', words.unwired],
    );
  }
  return `${markdownTable(words.partsHead, parts)}\n\n${markdownTable(words.signalsHead, signals)}\n`;
}

export interface PartLabel {
  id: string;
  title: string;
  /** One line per wired signal: `Variable ← signal` for a PLC input, `Variable → signal` for a PLC output. */
  lines: string[];
}

/** One label per part, in the order of the scene. */
export function partLabels(rows: readonly MachineRow[], locale: Locale): PartLabel[] {
  const labels = new Map<string, PartLabel>();
  for (const { part, signal } of rows) {
    const label = labels.get(part.id) ?? { id: part.id, title: `${part.name} · ${part.kindName[locale]}`, lines: [] };
    labels.set(part.id, label);
    if (signal)
      label.lines.push(
        `${variableOf(signal.point)} ${signal.direction === 'sensor' ? '←' : '→'} ${signal.name.slice(part.name.length + 1)}`,
      );
  }
  return [...labels.values()];
}

/** The legend of the arrows of the labels. */
export const LEGEND: Record<Locale, string> = {
  en: 'Variable ← signal: a PLC input.   Variable → signal: a PLC output.',
  es: 'Variable ← señal: una entrada del PLC.   Variable → señal: una salida del PLC.',
};
