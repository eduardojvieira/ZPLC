import type { WatchVariable } from './debugAdapter';
import { getTypeSize } from './debugAdapter';

export function parsePeekBytes(lines: string[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let byteIndex = 0;

  for (const line of lines) {
    if (line.startsWith('Memory at')) {
      continue;
    }

    const match = line.match(/^[0-9A-Fa-f]+:\s+((?:[0-9A-Fa-f]{2}\s*)+)/);
    if (!match) {
      continue;
    }

    const hexBytes = match[1].trim().split(/\s+/);
    for (const hexByte of hexBytes) {
      if (byteIndex < length) {
        result[byteIndex++] = parseInt(hexByte, 16);
      }
    }
  }

  return result;
}

/**
 * A contiguous memory region covering one or more watch variables.
 * A single `zplc dbg peek <base> <span>` can read all variables in the group.
 */
export interface PeekGroup {
  /** Absolute base address of the region to read */
  baseAddress: number;
  /** Total byte span to read (from base to end of last variable) */
  span: number;
  /** The variables that belong to this group, sorted by address */
  variables: WatchVariable[];
}

/**
 * The maximum gap (in bytes) between two adjacent variables that will still be
 * merged into one peek. Keeping this small limits wasted serial bandwidth.
 * 16 bytes = sensible default; a few unused alignment bytes between vars
 * won't cause extra round-trips.
 */
const MAX_MERGE_GAP = 16;

/**
 * Group a list of watch variables into contiguous peek regions.
 *
 * Variables within MAX_MERGE_GAP bytes of each other are merged into a
 * single peek. This reduces serial round-trips from N (one per variable) to
 * roughly one per memory region, providing a near-atomic snapshot of each
 * region and eliminating the cross-cycle skew visible in the watch table.
 *
 * @param variables - The variables to group (any order is fine; we sort internally)
 * @returns Array of PeekGroup, each describing one batched peek operation
 */
export function groupVariablesForBatchPeek(variables: WatchVariable[]): PeekGroup[] {
  if (variables.length === 0) return [];

  // Sort by address ascending
  const sorted = [...variables].sort((a, b) => a.address - b.address);

  const groups: PeekGroup[] = [];
  let currentGroup: PeekGroup | null = null;

  for (const v of sorted) {
    const size = getTypeSize(v.type, v.maxLength);
    const varEnd = v.address + size; // exclusive end

    if (currentGroup === null) {
      currentGroup = {
        baseAddress: v.address,
        span: size,
        variables: [v],
      };
    } else {
      const currentEnd = currentGroup.baseAddress + currentGroup.span;
      const gap = v.address - currentEnd;

      if (gap <= MAX_MERGE_GAP) {
        // Extend current group to cover this variable
        currentGroup.span = varEnd - currentGroup.baseAddress;
        currentGroup.variables.push(v);
      } else {
        // Start a new group
        groups.push(currentGroup);
        currentGroup = {
          baseAddress: v.address,
          span: size,
          variables: [v],
        };
      }
    }
  }

  if (currentGroup !== null) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Given a raw byte buffer read from `baseAddress`, extract the bytes for a
 * single variable and return them as a Uint8Array.
 *
 * @param buffer   - Raw bytes starting at `baseAddress`
 * @param baseAddress - The address the buffer starts at
 * @param variable    - The variable to extract
 */
export function extractVariableBytes(
  buffer: Uint8Array,
  baseAddress: number,
  variable: WatchVariable,
): Uint8Array {
  const size = getTypeSize(variable.type, variable.maxLength);
  const offset = variable.address - baseAddress;

  if (offset < 0 || offset + size > buffer.length) {
    // Return zeros if out of range (should never happen with correct grouping)
    return new Uint8Array(size);
  }

  return buffer.slice(offset, offset + size);
}

// =============================================================================
// mpeek — single-round-trip multi-address read
// =============================================================================

/**
 * A single entry in an `mpeek` request.
 * Sent to the firmware as `addr:len` in a comma-separated list.
 */
export interface MpeekRequest {
  address: number;
  size: number;
}

/**
 * A single entry in the firmware's `mpeek` JSON response.
 * Example raw JSON element: {"addr":8192,"bytes":"0700"}
 */
interface MpeekResultEntry {
  addr: number;
  bytes: string;
}

/**
 * Top-level shape of the firmware's `mpeek` JSON response.
 * Example: {"t":"mpeek","results":[{"addr":8192,"bytes":"0700"}]}
 */
interface MpeekResponse {
  t: 'mpeek';
  results: MpeekResultEntry[];
}

/**
 * Parse the firmware's `mpeek` JSON response and return a Map from
 * absolute address → raw bytes as Uint8Array.
 *
 * The firmware emits the response across multiple `shell_print` calls which
 * produce separate lines. This function concatenates all lines, extracts the
 * JSON object, and decodes each result entry.
 *
 * @param lines - Output lines captured from the serial port after sending
 *                `zplc dbg mpeek addr:len,...`
 * @returns Map from address to raw bytes, or an empty Map on parse failure.
 */
export function parseMpeekResponse(lines: string[]): Map<number, Uint8Array> {
  const result = new Map<number, Uint8Array>();

  console.log('[parseMpeekResponse] Raw lines incoming:', lines);

  // Concatenate all lines (the firmware emits JSON across multiple shell_print
  // calls) and strip ANSI escape sequences + shell prompts.
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[[0-9;]*[mK]/g;
  const combined = lines
    .map((l) => l.replace(ansiRegex, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('uart:~$'))
    .join('');

  console.log('[parseMpeekResponse] Combined string:', combined);

  // Find the outermost JSON object boundaries.
  const jsonStart = combined.indexOf('{');
  if (jsonStart < 0) {
    console.warn('[parseMpeekResponse] No JSON start { found');
    return result;
  }

  // Since the shell_print appends newlines, there might be internal formatting.
  // We can just rely on standard JSON parser if we extract the right substring.
  // The C code outputs `]}` at the very end.
  const jsonEnd = combined.lastIndexOf('}');
  
  if (jsonEnd <= jsonStart) {
    console.warn('[parseMpeekResponse] Invalid JSON boundaries', { jsonStart, jsonEnd });
    return result;
  }

  let parsed: MpeekResponse;
  try {
    // Sometimes the last serial line is cut or has extra garbage.
    const cleanJsonStr = combined.slice(jsonStart, jsonEnd + 1)
        // Fix any trailing commas in the array just in case
        .replace(/,\s*\]/, ']');
        
    console.log('[parseMpeekResponse] Clean JSON string:', cleanJsonStr);
    parsed = JSON.parse(cleanJsonStr) as MpeekResponse;
    console.log('[parseMpeekResponse] Parsed Object:', parsed);
  } catch (err) {
    console.error('[mpeek parse error]', err, combined);
    return result;
  }

  if (parsed.t !== 'mpeek' || !Array.isArray(parsed.results)) {
    console.warn('[parseMpeekResponse] Invalid schema (not mpeek or no results array)');
    return result;
  }

  for (const entry of parsed.results) {
    if (typeof entry.addr !== 'number' || typeof entry.bytes !== 'string') {
      console.warn('[parseMpeekResponse] Skipping invalid entry:', entry);
      continue;
    }

    const hex = entry.bytes;
    const byteCount = Math.floor(hex.length / 2);
    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    result.set(entry.addr, bytes);
  }

  console.log('[parseMpeekResponse] Final parsed map size:', result.size);
  return result;
}

/**
 * Build the `zplc dbg mpeek` argument string from a list of requests.
 * Example output: "0x2000:2,0x2002:2,0x2004:1"
 */
export function buildMpeekArgument(requests: MpeekRequest[]): string {
  return requests
    .map((r) => `0x${r.address.toString(16)}:${r.size}`)
    .join(',');
}
