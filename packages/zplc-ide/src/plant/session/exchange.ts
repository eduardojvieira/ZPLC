/**
 * The lock-step exchange (R3, LNK-003): the memory side of one scan. One `memory.read` of the output image range that holds
 * every mapped command (a numeric slot counts its width), one `memory.read` and one `memory.write` of the input image range that holds
 * every mapped sensor. The order of the
 * plant
 * operations is `exchangeScan` of the scenario seam (S1), imported and not copied, so a live run and a graded run of the same
 * scene and script give the same trace (PLT-017).
 */
import type { PlantCore, PlantRuntimePort } from '../contracts';
import type { IoMap } from '../../runtime/ioMap';
import { resolvePlantMap, type PlantMapV2 } from '../../plants/plantMap';
import { exchangeScan } from '../../test-engine/scenePort';

/** `memory.read` and `memory.write` carry at most this many bytes (contract C5). */
export const MAX_EXCHANGE_BYTES = 64;

/** One mapped signal inside an exchanged range: a BOOL is one `bit` of its byte, an INT or REAL is `width` little-endian bytes. */
export interface Slot {
  name: string;
  /** Byte offset inside the exchanged range. */
  byte: number;
  width: 1 | 2 | 4;
  type: 'BOOL' | 'INT' | 'REAL';
  /** BOOL only. */
  bit?: number;
}

export interface ExchangeLayout {
  /** The input image range written every scan; the session owns every bit of it. */
  inputBase: number;
  inputLength: number;
  outputBase: number;
  outputLength: number;
  sensors: readonly Slot[];
  commands: readonly (Slot & { point: string })[];
}

const WIDTH = { BOOL: 1, INT: 2, REAL: 4 } as const;

/** Binds the map to the program's I/O map: one bit per BOOL signal, 2 (INT) or 4 (REAL) bytes per numeric one. Throws a located Error. */
export function planExchange(map: PlantMapV2, ioMap: IoMap): ExchangeLayout {
  const resolved = resolvePlantMap(map, ioMap);
  const problems = [...resolved.problems];
  const image = (name: string, point: { region: string; type: string; bitOffset?: number; path: string }, input: boolean) => {
    const [region, letter, verb] = input ? ['IPI', 'I', 'input'] : ['OPI', 'Q', 'output'];
    const who = input ? 'the plant cannot write it' : 'the plant cannot read it';
    if (point.type === 'BOOL') {
      if (point.region !== region || point.bitOffset === undefined)
        problems.push(`${name}: ${point.path} is not a bit of the ${verb} image (%${letter}X); ${who}`);
    } else {
      if (point.region !== region) problems.push(`${name}: ${point.path} is not in the ${verb} image (%${letter}); ${who}`);
      if (!map.signals[name]!.range) problems.push(`${name}: a numeric signal needs its range in the map`);
    }
    return WIDTH[point.type as keyof typeof WIDTH] ?? 1;
  };
  const sensors = Object.entries(resolved.drives).map(([name, input]) => ({
    name,
    address: input.address,
    bit: input.bitOffset ?? 0,
    type: input.type as Slot['type'],
    width: image(name, input, true),
  }));
  const commands = Object.entries(resolved.reads).map(([name, output]) => ({
    name,
    point: map.signals[name]!.point,
    address: output.address,
    bit: output.bitOffset ?? 0,
    type: output.type as Slot['type'],
    width: image(name, output, false),
  }));
  const range = (items: readonly { name: string; address: number; width: number; type: string }[], what: string) => {
    if (items.length === 0) return { base: 0, length: 0 };
    const low = Math.min(...items.map((item) => item.address));
    const length = Math.max(...items.map((item) => item.address + item.width)) - low;
    if (length > MAX_EXCHANGE_BYTES)
      problems.push(`the ${what} span ${length} bytes; one exchange carries at most ${MAX_EXCHANGE_BYTES}; map them closer together`);
    // A numeric slot owns all its bytes: no other signal may share one (a bit another signal owns, or a second numeric slot).
    for (const a of items)
      for (const b of items)
        if (
          a.name < b.name &&
          (a.type !== 'BOOL' || b.type !== 'BOOL') &&
          a.address < b.address + b.width &&
          b.address < a.address + a.width
        )
          problems.push(`${a.name} and ${b.name} share a byte of the ${what} image; a numeric signal needs its own bytes`);
    return { base: low, length };
  };
  const inputs = range(sensors, 'sensors');
  const outputs = range(commands, 'commands');
  if (problems.length > 0) throw new Error(`plant: ${problems.join('; ')}`);
  const slot = (item: (typeof sensors)[number], base: number): Slot => ({
    name: item.name,
    byte: item.address - base,
    width: item.width as Slot['width'],
    type: item.type,
    ...(item.type === 'BOOL' ? { bit: item.bit } : {}),
  });
  return {
    inputBase: inputs.base,
    inputLength: inputs.length,
    outputBase: outputs.base,
    outputLength: outputs.length,
    sensors: sensors.map((s) => slot(s, inputs.base)),
    commands: commands.map((c) => ({ ...slot(c, outputs.base), point: c.point })),
  };
}

/**
 * One scan's worth of exchange for the scan at `atMs`: read the command image, then the plant steps and the sensor image is
 * written. The runtime's scan follows.
 */
export async function exchangeOnce(
  core: PlantCore,
  runtime: Pick<PlantRuntimePort, 'peek' | 'pokeN'>,
  map: PlantMapV2,
  layout: ExchangeLayout,
  atMs: number,
  scanMs: number,
): Promise<void> {
  // The one read of the scan. The first scan ignores it: the graded run starts with every command false (PLT-017).
  const read = layout.outputLength > 0 ? await runtime.peek(layout.outputBase, layout.outputLength) : new Uint8Array(0);
  const image = atMs > 0 ? read : new Uint8Array(0);
  const slotOf = new Map(layout.commands.map((c) => [c.point, c]));
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  await exchangeScan(
    { core, map },
    async (point) => {
      const c = slotOf.get(point)!;
      if (c.type === 'BOOL') return ((image[c.byte] ?? 0) & (1 << (c.bit ?? 0))) !== 0;
      if (image.byteLength === 0) return 0; // the first scan ignores the image, as for a BOOL
      return c.type === 'INT' ? view.getInt16(c.byte, true) : view.getFloat32(c.byte, true);
    },
    async (sensed) => {
      if (layout.inputLength === 0) return;
      // Bits the plant map does not drive (a person's Faceplate value) are kept: read the range, write the sensor bits over it.
      // ponytail: a Faceplate write landing between this read and the write below can be lost; closing it needs a masked
      // write in the runtime or routing the Faceplate through the session.
      const bytes = new Uint8Array(await runtime.peek(layout.inputBase, layout.inputLength));
      const out = new DataView(bytes.buffer);
      for (const s of layout.sensors) {
        if (s.type === 'BOOL') {
          if (sensed[s.name]) bytes[s.byte]! |= 1 << s.bit!;
          else bytes[s.byte]! &= ~(1 << s.bit!);
        } else if (typeof sensed[s.name] === 'number') {
          if (s.type === 'INT') out.setInt16(s.byte, sensed[s.name] as number, true);
          else out.setFloat32(s.byte, sensed[s.name] as number, true);
        }
      }
      await runtime.pokeN(layout.inputBase, bytes);
    },
    atMs,
    scanMs,
  );
}
