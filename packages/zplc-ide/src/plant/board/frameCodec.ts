/**
 * @file frameCodec.ts
 * @brief The value encoding of the plant I/O frames (C-M6-1) and the entry descriptors of a layout.
 *
 * Both directions use one encoding: a bitmap of `ceil(nBool / 8)` bytes with the BOOL values in descriptor order (unused
 * bits zero), then every INT (2 bytes, signed, little endian) and REAL (4 bytes, binary32, little endian) in descriptor order.
 */
import { MEMORY_MAP } from '../../runtime/debugAdapter';
import type { ExchangeLayout } from '../session/exchange';
import type { PlantSlotDescriptor } from './portTypes';

export type SlotValue = boolean | number;
type Typed = { readonly type: 'BOOL' | 'INT' | 'REAL' };

const WIDTH = { BOOL: 0, INT: 2, REAL: 4 } as const;

export function valueBytes(slots: readonly Typed[]): number {
  const bools = slots.filter((s) => s.type === 'BOOL').length;
  return Math.ceil(bools / 8) + slots.reduce((sum, s) => sum + WIDTH[s.type], 0);
}

export function packValues(slots: readonly Typed[], values: readonly SlotValue[]): Uint8Array {
  if (values.length !== slots.length) throw new RangeError(`${slots.length} values expected, got ${values.length}`);
  const out = new Uint8Array(valueBytes(slots));
  const view = new DataView(out.buffer);
  let at = Math.ceil(slots.filter((s) => s.type === 'BOOL').length / 8);
  let bit = 0;
  slots.forEach((slot, i) => {
    const value = values[i]!;
    if (slot.type === 'BOOL') {
      if (value) out[bit >> 3]! |= 1 << (bit & 7);
      bit++;
      return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`slot ${i}: a numeric value must be finite`);
    if (slot.type === 'INT') view.setInt16(at, value, true);
    else view.setFloat32(at, value, true);
    at += WIDTH[slot.type];
  });
  return out;
}

export function unpackValues(slots: readonly Typed[], bytes: Uint8Array): SlotValue[] {
  const expected = valueBytes(slots);
  if (bytes.length !== expected) throw new RangeError(`the values are ${expected} bytes, got ${bytes.length}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bools = slots.filter((s) => s.type === 'BOOL').length;
  if (bools % 8 !== 0 && bytes[bools >> 3]! >> (bools & 7) !== 0) throw new RangeError('a padding bit of the bitmap is set');
  let at = Math.ceil(bools / 8);
  let bit = 0;
  return slots.map((slot, i) => {
    if (slot.type === 'BOOL') {
      const value = (bytes[bit >> 3]! & (1 << (bit & 7))) !== 0;
      bit++;
      return value;
    }
    const value = slot.type === 'INT' ? view.getInt16(at, true) : view.getFloat32(at, true);
    if (!Number.isFinite(value)) throw new RangeError(`slot ${i}: a REAL value is not finite`);
    at += WIDTH[slot.type];
    return value;
  });
}

/** The entry descriptors of a layout: sensors are the inputs (IPI offsets), commands the outputs (OPI offsets). */
export function descriptorsOf(layout: ExchangeLayout): { inputs: PlantSlotDescriptor[]; outputs: PlantSlotDescriptor[] } {
  const describe = (base: number, region: number) => (s: { byte: number; type: 'BOOL' | 'INT' | 'REAL'; bit?: number }) => ({
    offset: base + s.byte - region,
    type: s.type,
    ...(s.type === 'BOOL' ? { bit: s.bit ?? 0 } : {}),
  });
  return {
    inputs: layout.sensors.map(describe(layout.inputBase, MEMORY_MAP.ipi.baseAddress)),
    outputs: layout.commands.map(describe(layout.outputBase, MEMORY_MAP.opi.baseAddress)),
  };
}
