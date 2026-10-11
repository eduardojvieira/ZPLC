/**
 * The process image a compiled program touches, read from its code (IO-004).
 *
 * Deploy admission compares what a program uses with the I/O description of the board it is deployed to. The bytes
 * that are sent are the only thing that is certain at that point, so the accesses are read from them: every
 * instruction that loads from or stores to a fixed address in the input image (0x0000 to 0x0FFF) or the output image
 * (0x1000 to 0x1FFF). An access through an address computed at run time (LOADI, STOREI) is not seen; those reach
 * work memory in the code the compiler emits.
 */
import { ZPLC_CONSTANTS, ZPLC_CONTRACT, readArtifact } from '@zplc/compiler';

export interface ProcessImageAccess {
  /** I: input image, Q: output image. */
  readonly region: 'I' | 'Q';
  /** Byte offset in the image of the first byte touched. */
  readonly byte: number;
  /** Bytes touched, 1 to 8. */
  readonly width: number;
  readonly access: 'read' | 'write';
}

const OPCODES = new Map(ZPLC_CONTRACT.OPCODE_TABLE.map((entry) => [entry.code, entry]));
const IPI = ZPLC_CONTRACT.MEMORY_REGION.IPI;
const OPI = ZPLC_CONTRACT.MEMORY_REGION.OPI;

/** The accesses in the code of the artifact, in code order; undefined when the bytes have no readable code. */
export function processImageAccesses(bytes: Uint8Array): ProcessImageAccess[] | undefined {
  const artifact = readArtifact(bytes);
  // Bytes that are not an artifact have no segments and no readable header; the loader refuses them at upload
  if (bytes.length < ZPLC_CONSTANTS.HEADER_SIZE || artifact.draftCounter === undefined) return undefined;
  const code = artifact.segments.find((segment) => segment.type === ZPLC_CONSTANTS.SEGMENT_TYPE_CODE);
  // An artifact without a code segment runs nothing and touches no process image
  if (!code) return [];
  const accesses: ProcessImageAccess[] = [];
  const end = code.offset + code.size;
  let pc = code.offset;
  while (pc < end) {
    const opcode = bytes[pc]!;
    const size = ZPLC_CONTRACT.getOperandSize(opcode);
    if (pc + 1 + size > end) return undefined;
    const memory = OPCODES.get(opcode)?.memory;
    if (memory && size === 2) {
      const address = bytes[pc + 1]! | (bytes[pc + 2]! << 8);
      if (address >= IPI.base && address < OPI.base + OPI.size) {
        const region = address < OPI.base ? 'I' : 'Q';
        accesses.push({ region, byte: address - (region === 'I' ? IPI.base : OPI.base), width: memory.width, access: memory.access });
      }
    }
    pc += 1 + size;
  }
  return accesses;
}
