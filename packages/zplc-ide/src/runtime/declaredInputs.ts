/**
 * The inputs that a program declares, as Studio can set them in native simulation (IDE-024).
 *
 * An input is any scalar variable mapped to the input image (`AT %I...`, whatever its name) and any `VAR_INPUT` of a
 * program that has no direct address; the build marks the second kind in the debug map with `INPUT_TAG` (the debug map
 * itself has no section). Nothing here is a list of names: the program decides what is an input. The runtime accepts
 * the three motor names of `simulation.input.set` only, so the others are written with the typed memory write that the
 * adapter already has, at the address and with the width the debug map gives, changing only the bit of a bit-addressed
 * BOOL.
 *
 * Pure TypeScript with no Electron, store or component import.
 */
import type { DebugMap } from '../compiler';

/** The synthetic tag that the Tool API puts on a `VAR_INPUT` variable of a program. It cannot be written in a source file. */
export const INPUT_TAG = 'zplc:input';

export interface DeclaredInput {
  /** `Program.Name`: the path the Watch table uses. */
  path: string;
  pou: string;
  name: string;
  type: string;
  region: 'IPI' | 'WORK';
  address: number;
  size: number;
  /** For a bit-addressed BOOL (`%IX0.3`): the bit inside the byte at `address`. */
  bitOffset?: number;
  origin: 'mapped' | 'program-input';
}

/** What reading a variable of the process image needs: where it is, how wide, and what it is (an input or an output). */
export type IoPoint = Pick<DeclaredInput, 'address' | 'size' | 'type' | 'bitOffset'>;

type Scalar = 'BOOL' | 'BYTE' | 'SINT' | 'USINT' | 'INT' | 'UINT' | 'WORD' | 'DINT' | 'UDINT' | 'DWORD' | 'TIME' | 'REAL' | 'LINT' | 'ULINT' | 'LWORD' | 'LREAL';

const WIDTH: Record<Scalar, number> = {
  BOOL: 1, BYTE: 1, SINT: 1, USINT: 1, INT: 2, UINT: 2, WORD: 2, DINT: 4, UDINT: 4, DWORD: 4, TIME: 4, REAL: 4,
  LINT: 8, ULINT: 8, LWORD: 8, LREAL: 8,
};
export const isScalar = (type: string): type is Scalar => Object.hasOwn(WIDTH, type);

/** Inclusive range of the integer types, by name. */
const RANGE: Partial<Record<Scalar, [bigint, bigint]>> = {
  BYTE: [0n, 255n], USINT: [0n, 255n], SINT: [-128n, 127n], INT: [-32_768n, 32_767n], UINT: [0n, 65_535n], WORD: [0n, 65_535n],
  DINT: [-2_147_483_648n, 2_147_483_647n], TIME: [-2_147_483_648n, 2_147_483_647n], UDINT: [0n, 4_294_967_295n], DWORD: [0n, 4_294_967_295n],
  LINT: [-(2n ** 63n), 2n ** 63n - 1n], ULINT: [0n, 2n ** 64n - 1n], LWORD: [0n, 2n ** 64n - 1n],
};

/** The scalar variables of the debug map that are inputs, in the order of the map. */
export function listDeclaredInputs(debugMap: DebugMap | null | undefined): DeclaredInput[] {
  if (!debugMap) return [];
  const found: DeclaredInput[] = [];
  for (const [pou, info] of Object.entries(debugMap.pou)) {
    for (const [name, variable] of Object.entries(info.vars)) {
      if (!isScalar(variable.type) || variable.children !== undefined) continue;
      const marked = variable.tags?.[INPUT_TAG] === true;
      const mapped = variable.region === 'IPI';
      if (!mapped && !(marked && variable.region === 'WORK')) continue;
      found.push({
        path: `${pou}.${name}`, pou, name, type: variable.type,
        region: mapped ? 'IPI' : 'WORK', address: variable.addr, size: variable.size,
        ...(variable.bitOffset === undefined ? {} : { bitOffset: variable.bitOffset }),
        origin: mapped ? 'mapped' : 'program-input',
      });
    }
  }
  return found;
}

/**
 * The bytes to write for a value, and where. A bit-addressed BOOL needs the byte as it is now (`currentByte`): the write
 * keeps the other bits of it. A value that does not fit the type is refused here, before anything reaches the runtime.
 */
export function inputWrite(input: DeclaredInput, value: boolean | number, currentByte?: number): { address: number; bytes: Uint8Array } {
  const type = input.type as Scalar;
  if (!isScalar(type)) throw new Error(`${input.name} is not a scalar input`);
  if (type === 'BOOL') {
    if (typeof value !== 'boolean') throw new Error(`${input.name} takes TRUE or FALSE`);
    if (input.bitOffset === undefined) return { address: input.address, bytes: Uint8Array.of(value ? 1 : 0) };
    if (currentByte === undefined) throw new Error(`${input.name} shares its byte: read it before writing`);
    const mask = 1 << input.bitOffset;
    return { address: input.address, bytes: Uint8Array.of(value ? (currentByte | mask) & 0xff : currentByte & ~mask & 0xff) };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${input.name} takes a number`);
  const bytes = new Uint8Array(WIDTH[type]);
  const view = new DataView(bytes.buffer);
  if (type === 'REAL') { view.setFloat32(0, value, true); return { address: input.address, bytes }; }
  if (type === 'LREAL') { view.setFloat64(0, value, true); return { address: input.address, bytes }; }
  if (!Number.isInteger(value)) throw new Error(`${input.name} takes a whole number`);
  const integer = BigInt(value);
  const [low, high] = RANGE[type]!;
  if (integer < low || integer > high) throw new Error(`${value} does not fit ${input.name} (${type}: ${low} to ${high})`);
  if (WIDTH[type] === 8) view.setBigUint64(0, BigInt.asUintN(64, integer), true);
  else for (let index = 0; index < WIDTH[type]; index += 1) bytes[index] = Number((integer >> BigInt(8 * index)) & 0xffn);
  return { address: input.address, bytes };
}

/**
 * The range of a slider for an input, from its type: the integers up to 16 bits. A wider integer has a range too large
 * to point at, and a REAL has none from its type, so those are set from a number box only.
 */
export function inputRange(input: Pick<DeclaredInput, 'type'>): { min: number; max: number } | null {
  const type = input.type;
  if (!isScalar(type) || WIDTH[type] > 2) return null;
  const range = RANGE[type];
  return range === undefined ? null : { min: Number(range[0]), max: Number(range[1]) };
}

/** The direct address of an input as the program writes it (`%IX0.3`, `%IW2`), or its place in the work memory. */
export function inputAddressLabel(input: DeclaredInput): string {
  if (input.region === 'WORK') return `WORK 0x${input.address.toString(16).toUpperCase().padStart(4, '0')}`;
  if (input.type === 'BOOL') return `%IX${input.address}.${input.bitOffset ?? 0}`;
  const prefix = input.size === 1 ? 'B' : input.size === 2 ? 'W' : input.size === 4 ? 'D' : 'L';
  return `%I${prefix}${input.size > 1 ? input.address / input.size : input.address}`;
}

/** The most the runtime returns for one memory read (the `memory.read` bound of the main-process allow-list). */
const MAX_READ = 64;

/** Two reads closer than this many bytes are one read: a request costs more than the bytes between them. */
const MERGE_GAP = 8;

/** Few ranges, at most 64 bytes each, that cover every input. */
export function inputReadPlan(inputs: readonly IoPoint[]): Array<{ address: number; length: number }> {
  const spans = inputs
    .map((input) => ({ start: input.address, end: input.address + Math.max(1, input.size) }))
    .sort((left, right) => left.start - right.start);
  const plan: Array<{ address: number; length: number }> = [];
  let current: { start: number; end: number } | null = null;
  const flush = () => {
    if (!current) return;
    for (let start = current.start; start < current.end; start += MAX_READ) plan.push({ address: start, length: Math.min(MAX_READ, current.end - start) });
  };
  for (const span of spans) {
    if (current && span.start <= current.end + MERGE_GAP) current.end = Math.max(current.end, span.end);
    else { flush(); current = { ...span }; }
  }
  flush();
  return plan;
}

/** The value of an input in memory, where `read` returns the bytes at an address (the planned ranges, already read). */
export function decodeInput(input: IoPoint, read: (address: number, length: number) => Uint8Array): boolean | number {
  const type = input.type as Scalar;
  const bytes = read(input.address, Math.max(1, input.size));
  if (type === 'BOOL') return input.bitOffset === undefined ? bytes[0] !== 0 : ((bytes[0] ?? 0) >> input.bitOffset & 1) === 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (type) {
    case 'BYTE': case 'USINT': return view.getUint8(0);
    case 'SINT': return view.getInt8(0);
    case 'INT': return view.getInt16(0, true);
    case 'UINT': case 'WORD': return view.getUint16(0, true);
    case 'DINT': case 'TIME': return view.getInt32(0, true);
    case 'UDINT': case 'DWORD': return view.getUint32(0, true);
    case 'REAL': return view.getFloat32(0, true);
    case 'LREAL': return view.getFloat64(0, true);
    case 'LINT': return Number(view.getBigInt64(0, true));
    default: return Number(view.getBigUint64(0, true));
  }
}
