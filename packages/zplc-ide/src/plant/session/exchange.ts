/**
 * The lock-step exchange (R3, LNK-003): the memory side of one scan. One `memory.read` of the output image range that holds
 * every mapped command, one `memory.write` of the input image range that holds every mapped sensor. The order of the plant
 * operations is `exchangeScan` of the scenario seam (S1), imported and not copied, so a live run and a graded run of the same
 * scene and script give the same trace (PLT-017).
 */
import type { PlantCore, PlantRuntimePort } from '../contracts';
import type { IoMap } from '../../runtime/ioMap';
import { resolvePlantMap, type PlantMapV2 } from '../../plants/plantMap';
import { exchangeScan } from '../../test-engine/scenePort';

/** `memory.read` and `memory.write` carry at most this many bytes (contract C5). */
export const MAX_EXCHANGE_BYTES = 64;

interface Bit {
  name: string;
  /** Byte offset inside the exchanged range. */
  byte: number;
  bit: number;
}

export interface ExchangeLayout {
  /** The input image range written every scan; the session owns every bit of it. */
  inputBase: number;
  inputLength: number;
  outputBase: number;
  outputLength: number;
  sensors: readonly Bit[];
  commands: readonly (Bit & { point: string })[];
}

/** Binds the map to the program's I/O map. BOOL only in M1, one bit per signal. Throws a located Error. */
export function planExchange(map: PlantMapV2, ioMap: IoMap): ExchangeLayout {
  const resolved = resolvePlantMap(map, ioMap);
  const problems = [...resolved.problems];
  for (const [name, signal] of Object.entries(map.signals))
    if (signal.type !== 'BOOL') problems.push(`${name}: the live session exchanges BOOL signals only, the signal is ${signal.type}`);
  const sensors = Object.entries(resolved.drives).map(([name, input]) => {
    if (input.region !== 'IPI' || input.type !== 'BOOL' || input.bitOffset === undefined)
      problems.push(`${name}: ${input.path} is not a bit of the input image (%IX); the plant cannot write it`);
    return { name, address: input.address, bit: input.bitOffset ?? 0 };
  });
  const commands = Object.entries(resolved.reads).map(([name, output]) => {
    if (output.type !== 'BOOL' || output.bitOffset === undefined)
      problems.push(`${name}: ${output.path} is not a bit of the output image (%QX); the plant cannot read it`);
    return { name, point: map.signals[name]!.point, address: output.address, bit: output.bitOffset ?? 0 };
  });
  const range = (items: readonly { address: number }[], what: string) => {
    if (items.length === 0) return { base: 0, length: 0 };
    const low = Math.min(...items.map((item) => item.address));
    const length = Math.max(...items.map((item) => item.address)) - low + 1;
    if (length > MAX_EXCHANGE_BYTES)
      problems.push(`the ${what} span ${length} bytes; one exchange carries at most ${MAX_EXCHANGE_BYTES}; map them closer together`);
    return { base: low, length };
  };
  const inputs = range(sensors, 'sensors');
  const outputs = range(commands, 'commands');
  if (problems.length > 0) throw new Error(`plant: ${problems.join('; ')}`);
  return {
    inputBase: inputs.base,
    inputLength: inputs.length,
    outputBase: outputs.base,
    outputLength: outputs.length,
    sensors: sensors.map((s) => ({ name: s.name, byte: s.address - inputs.base, bit: s.bit })),
    commands: commands.map((c) => ({ name: c.name, point: c.point, byte: c.address - outputs.base, bit: c.bit })),
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
  const bitOf = new Map(layout.commands.map((c) => [c.point, c]));
  await exchangeScan(
    { core, map },
    async (point) => {
      const c = bitOf.get(point)!;
      return ((image[c.byte] ?? 0) & (1 << c.bit)) !== 0;
    },
    async (sensed) => {
      if (layout.inputLength === 0) return;
      // ponytail: the session owns the whole input range, so an unmapped bit of those bytes is written 0;
      // read-modify-write would need a second memory.read per scan (LNK-003)
      const bytes = new Uint8Array(layout.inputLength);
      for (const s of layout.sensors) if (sensed[s.name]) bytes[s.byte]! |= 1 << s.bit;
      await runtime.pokeN(layout.inputBase, bytes);
    },
    atMs,
    scanMs,
  );
}
