/**
 * @file memoryAccess.ts
 * @brief The one address and length check of the serial, native and WASM adapters (COM-024).
 *
 * An access is valid only when its whole extent [address, address + length) lies inside ONE region of PLC memory.
 * This is the rule of the device (zplc_mem_extent_locate of the core): a region is its window of the address space,
 * from its base to the base of the next region, or its configured size where that is smaller; an extent that
 * crosses two regions, or leaves PLC memory, is refused. A write is also refused in a region the program owns
 * (OPI is written by the scan) and in CODE.
 *
 * A rejected access names what was asked for (the address, the length), why, and the region that holds the address
 * with its valid range, so that the message is the same whichever adapter raised it.
 */

import { MEMORY_MAP, type MemoryRegion } from './debugAdapter';

export type AccessKind = 'read' | 'write' | 'force';

export type AccessRefusal = 'length' | 'outside' | 'crosses' | 'not-writable';

/** Bytes each region has on this device; a device reports them (`sys info`), a simulator has the contract's. */
export interface RegionSizes {
  readonly ipi: number;
  readonly opi: number;
  readonly work: number;
  readonly retain: number;
}

export const CONTRACT_REGION_SIZES: RegionSizes = {
  ipi: MEMORY_MAP.ipi.size,
  opi: MEMORY_MAP.opi.size,
  work: MEMORY_MAP.work.size,
  retain: MEMORY_MAP.retain.size,
};

export interface AllowedRegion {
  readonly name: Exclude<MemoryRegion, 'code'>;
  /** First address of the region. */
  readonly start: number;
  /** One past the last address that can be reached. */
  readonly end: number;
}

const ORDER = ['ipi', 'opi', 'work', 'retain'] as const;

/** The regions with the window each one has on a device with these sizes. */
export function regionsOf(sizes: RegionSizes = CONTRACT_REGION_SIZES): readonly AllowedRegion[] {
  return ORDER.map((name, index) => {
    const start = MEMORY_MAP[name].baseAddress;
    const nextBase = index + 1 < ORDER.length ? MEMORY_MAP[ORDER[index + 1]!].baseAddress : MEMORY_MAP.code.baseAddress;
    return { name, start, end: Math.min(start + sizes[name], nextBase) };
  });
}

export class MemoryAccessError extends Error {
  readonly address: number;
  readonly length: number;
  readonly kind: AccessKind;
  readonly reason: AccessRefusal;
  /** The region that holds the address, or null when the address is outside PLC memory. */
  readonly region: AllowedRegion | null;
  /** Every region the device has, for an address outside all of them. */
  readonly validRanges: readonly AllowedRegion[];

  constructor(
    kind: AccessKind,
    address: number,
    length: number,
    reason: AccessRefusal,
    region: AllowedRegion | null,
    regions: readonly AllowedRegion[],
  ) {
    super(describe(kind, address, length, reason, region, regions));
    this.name = 'MemoryAccessError';
    this.kind = kind;
    this.address = address;
    this.length = length;
    this.reason = reason;
    this.region = region;
    this.validRanges = regions;
  }
}

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
const span = (region: AllowedRegion) => `${region.name.toUpperCase()} ${hex(region.start)} to ${hex(region.end - 1)}`;

function describe(
  kind: AccessKind,
  address: number,
  length: number,
  reason: AccessRefusal,
  region: AllowedRegion | null,
  regions: readonly AllowedRegion[],
): string {
  const asked = `${kind === 'read' ? 'Cannot read' : kind === 'write' ? 'Cannot write' : 'Cannot force'} ${length} byte${
    length === 1 ? '' : 's'
  } at ${hex(address)}`;
  switch (reason) {
    case 'length':
      return `${asked}: the length has to be at least one byte and the access has to end inside the 16-bit address space`;
    case 'outside':
      return `${asked}: the address is outside PLC memory (valid: ${regions.map(span).join('; ')})`;
    case 'crosses':
      return `${asked}: the access runs out of ${region ? span(region) : 'its region'}; one access stays inside one region`;
    case 'not-writable':
      return `${asked}: ${region ? span(region) : 'this region'} is written by the program and is not writable (it can be forced)`;
  }
}

/**
 * The refusal an access gets, or null when it is valid.
 *
 * @param sizes the sizes of the regions on the device (default: the contract's, which a simulator has)
 */
export function checkMemoryAccess(
  address: number,
  length: number,
  kind: AccessKind,
  sizes: RegionSizes = CONTRACT_REGION_SIZES,
): MemoryAccessError | null {
  const regions = regionsOf(sizes);
  const holder = regions.find((region) => address >= region.start && address < region.end) ?? null;
  if (!Number.isInteger(address) || !Number.isInteger(length) || address < 0 || length < 1 || address + length > 0x10000) {
    return new MemoryAccessError(kind, address, length, 'length', holder, regions);
  }
  if (holder === null) return new MemoryAccessError(kind, address, length, 'outside', null, regions);
  if (address + length > holder.end) return new MemoryAccessError(kind, address, length, 'crosses', holder, regions);
  if (kind === 'write' && holder.name === 'opi') return new MemoryAccessError(kind, address, length, 'not-writable', holder, regions);
  return null;
}

/** Throws the refusal of an access, if it has one. */
export function assertMemoryAccess(address: number, length: number, kind: AccessKind, sizes: RegionSizes = CONTRACT_REGION_SIZES): void {
  const refusal = checkMemoryAccess(address, length, kind, sizes);
  if (refusal !== null) throw refusal;
}

/** Whether two addresses are in the same region (a batched read has to stay inside one). */
export function sameRegion(first: number, second: number, sizes: RegionSizes = CONTRACT_REGION_SIZES): boolean {
  const regions = regionsOf(sizes);
  const a = regions.find((region) => first >= region.start && first < region.end);
  return a !== undefined && second >= a.start && second < a.end;
}
