/**
 * @file watchTable.ts
 * @brief What the Watch table does with a value and a list of rows (IDE-019): display formats, typed values, sorting
 * and symbol completion. Pure functions, so they are tested without a renderer.
 */

import type { DebugMap } from '../compiler';
import type { LiveValue } from '../store/useIDEStore';
import { formatDebugValue } from '../hooks/formatDebugValue';

export const WATCH_FORMAT = { AUTO: 'auto', DECIMAL: 'dec', HEX: 'hex', BINARY: 'bin', REAL: 'real', TIME: 'time' } as const;
export type WatchFormat = (typeof WATCH_FORMAT)[keyof typeof WATCH_FORMAT];
export const WATCH_FORMATS: readonly WatchFormat[] = Object.values(WATCH_FORMAT);

const BITS: Record<string, number> = {
  SINT: 8,
  USINT: 8,
  BYTE: 8,
  INT: 16,
  UINT: 16,
  WORD: 16,
  DINT: 32,
  UDINT: 32,
  DWORD: 32,
  LINT: 64,
  ULINT: 64,
  LWORD: 64,
};
const NOT_NUMERIC = new Set(['BOOL', 'STRING']);

const toBig = (value: LiveValue): bigint | null => {
  try {
    return BigInt(typeof value === 'boolean' ? (value ? 1 : 0) : typeof value === 'number' ? Math.trunc(value) : value);
  } catch {
    return null;
  }
};

function formatTime(ms: number): string {
  let rest = Math.max(0, Math.trunc(ms));
  const parts: string[] = [];
  for (const [unit, size] of [
    ['d', 86400000],
    ['h', 3600000],
    ['m', 60000],
    ['s', 1000],
  ] as const) {
    if (rest >= size) {
      parts.push(`${Math.floor(rest / size)}${unit}`);
      rest %= size;
    }
  }
  if (rest > 0 || parts.length === 0) parts.push(`${rest}ms`);
  return `T#${parts.join('')}`;
}

/** The text of a value in the chosen format. A BOOL, a STRING and a missing value ignore the format. */
export function formatWatchValue(value: LiveValue | null, type: string | null, format: WatchFormat): string {
  if (value === null || value === undefined || format === WATCH_FORMAT.AUTO || type === null || NOT_NUMERIC.has(type)) {
    return formatDebugValue(value, type);
  }
  const isFloat = type === 'REAL' || type === 'LREAL';
  switch (format) {
    case WATCH_FORMAT.DECIMAL:
      return String(value);
    case WATCH_FORMAT.REAL:
      return isFloat ? formatDebugValue(value, type) : Number.isFinite(Number(value)) ? Number(value).toFixed(1) : String(value);
    case WATCH_FORMAT.TIME:
      return Number.isFinite(Number(value)) ? formatTime(Number(value)) : String(value);
    case WATCH_FORMAT.HEX:
    case WATCH_FORMAT.BINARY: {
      const bits = BITS[type] ?? (type === 'REAL' ? 32 : type === 'LREAL' || type === 'TIME' ? 64 : 0);
      const big = isFloat ? floatBits(Number(value), bits) : toBig(value);
      if (!bits || big === null) return formatDebugValue(value, type);
      const unsigned = BigInt.asUintN(bits, big);
      return format === WATCH_FORMAT.HEX
        ? `16#${unsigned
            .toString(16)
            .toUpperCase()
            .padStart(bits / 4, '0')}`
        : `2#${unsigned.toString(2).padStart(bits, '0')}`;
    }
  }
}

function floatBits(value: number, bits: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  if (bits === 32) {
    view.setFloat32(0, value);
    return BigInt(view.getUint32(0));
  }
  view.setFloat64(0, value);
  return view.getBigUint64(0);
}

const TIME_PART = /(\d+(?:\.\d+)?)(d|h|ms|m|s)/gi;
const TIME_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 } as const;

/** The value a typed text means for a type, or null when it does not mean one. */
export function parseWatchDraft(raw: string, type: string): LiveValue | null {
  const text = raw.trim();
  if (type === 'BOOL') return text === '1' || text.toLowerCase() === 'true';
  if (type === 'STRING') return raw;
  if (text === '') return null;
  const radix = /^(16|2|8)#([0-9a-f_]+)$/i.exec(text) ?? /^0(x)([0-9a-f]+)$/i.exec(text);
  if (radix) {
    const parsed = Number.parseInt(radix[2].replace(/_/g, ''), radix[1] === 'x' ? 16 : Number(radix[1]));
    return Number.isNaN(parsed) ? null : parsed;
  }
  const time = /^(?:T|TIME)#(.+)$/i.exec(text);
  if (time) {
    const matches = [...time[1].matchAll(TIME_PART)];
    if (matches.length === 0 || matches.map((m) => m[0]).join('') !== time[1]) return null;
    return matches.reduce((sum, m) => sum + Number(m[1]) * TIME_MS[m[2].toLowerCase() as keyof typeof TIME_MS], 0);
  }
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export type WatchSortKey = 'name' | 'value' | 'type' | 'address';
export type WatchSortDirection = 'asc' | 'desc';

interface SortableRow {
  path: string;
  result: { value: LiveValue | null; type: string | null; address: number | null };
}

/** The rows in the order of a column; without a key they stay in the order they were added. A missing value sorts last. */
export function sortWatchRows<T extends SortableRow>(rows: readonly T[], key: WatchSortKey | null, direction: WatchSortDirection): T[] {
  if (key === null) return [...rows];
  const pick = (row: T): string | number | null => {
    switch (key) {
      case 'name':
        return row.path.toLowerCase();
      case 'type':
        return row.result.type;
      case 'address':
        return row.result.address;
      case 'value': {
        const v = row.result.value;
        return v === null ? null : typeof v === 'boolean' ? Number(v) : v;
      }
    }
  };
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return (
      sign *
      (typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), undefined, { numeric: true }))
    );
  });
}

/** The variables and members of the debug map that start with the typed text, for the add field. */
export function completeWatchSymbols(map: DebugMap | null, typed: string, limit = 50): string[] {
  if (!map) return [];
  const prefix = typed.trim().toLowerCase();
  const found = new Set<string>();
  for (const pou of Object.values(map.pou)) {
    for (const [name, info] of Object.entries(pou.vars)) {
      found.add(name);
      for (const member of Object.keys(info.children ?? {})) found.add(`${name}.${member}`);
    }
  }
  return [...found]
    .filter((name) => name.toLowerCase().startsWith(prefix))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}
