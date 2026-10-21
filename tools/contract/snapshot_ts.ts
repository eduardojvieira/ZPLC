/**
 * Contract snapshot, TypeScript side (WP-11 / VF-012).
 *
 * Prints, as JSON on stdout, the numbers that the compiler and the IDE hold today in their own definitions:
 * opcode table, operand sizes, container constants, memory regions, error codes, type and tag identifiers and
 * the communication block layouts. snapshot.py merges this with the C and Python views and the golden test
 * compares the result with the frozen snapshot taken before the tables were generated.
 *
 * Run from the repository root: bun tools/contract/snapshot_ts.ts
 */
import {
  Opcode,
  OPCODE_BY_NAME,
  getOperandSize,
  isRelativeJump,
  isAddressOperand,
} from '../../packages/zplc-compiler/src/assembler/opcodes.ts';
import { ZPLC_CONSTANTS, TASK_TYPE } from '../../packages/zplc-compiler/src/assembler/types.ts';
import { COMM_FB_KIND, CommBlocks } from '../../packages/zplc-compiler/src/compiler/stdlib/communication.ts';
import { MemoryLayout } from '../../packages/zplc-compiler/src/compiler/symbol-table.ts';
import { createDebugMap } from '../../packages/zplc-compiler/src/compiler/debug-map.ts';
import { DEFAULT_COMPILER_MEMORY_PROFILE, TAG_MAP, getDataTypeId } from '../../packages/zplc-compiler/src/compiler/codegen.ts';
import { VM_ERRORS } from '../../packages/zplc-ide/src/runtime/nativeTrace.ts';
import { MEMORY_MAP, getMemoryRegion } from '../../packages/zplc-ide/src/runtime/debugAdapter.ts';

const TYPE_NAMES = [
  'BOOL',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'REAL',
  'LREAL',
  'TIME',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'STRING',
];

const operandSizes: Record<string, number> = {};
const relativeJumps: number[] = [];
const addressOperands: number[] = [];
for (let code = 0; code < 256; code++) {
  operandSizes[String(code)] = getOperandSize(code);
  if (isRelativeJump(code)) relativeJumps.push(code);
  if (isAddressOperand(code)) addressOperands.push(code);
}

const blocks: Record<string, unknown> = {};
for (const [name, def] of Object.entries(CommBlocks)) {
  blocks[name] = {
    size: def.size,
    members: def.members.map((member) => ({
      name: member.name,
      type: String(member.type),
      offset: member.offset,
      size: member.size,
      direction: member.isInput ? 'in' : member.isOutput ? 'out' : 'internal',
    })),
  };
}

const debugMap = createDebugMap('snapshot');

const view = {
  compiler: {
    opcodes: { ...Opcode },
    opcodeByName: { ...OPCODE_BY_NAME },
    operandSizes,
    relativeJumps,
    addressOperands,
    constants: { ...ZPLC_CONSTANTS },
    taskTypes: { ...TASK_TYPE },
    commKinds: { ...COMM_FB_KIND },
    commBlocks: blocks,
    memoryLayout: { ...MemoryLayout },
    debugMapLayout: { ...debugMap.memoryLayout },
    defaultMemoryProfile: { ...DEFAULT_COMPILER_MEMORY_PROFILE },
    tagIds: { ...TAG_MAP },
    typeIds: Object.fromEntries(TYPE_NAMES.map((name) => [name, getDataTypeId(name)])),
  },
  ide: {
    vmErrors: Object.fromEntries(VM_ERRORS.map((entry) => [entry.name, entry.code])),
    memoryMap: Object.fromEntries(Object.entries(MEMORY_MAP).map(([name, info]) => [name, { base: info.baseAddress, size: info.size }])),
    regionOf: Object.fromEntries(
      [0x0000, 0x0fff, 0x1000, 0x1fff, 0x2000, 0x3fff, 0x4000, 0x4fff, 0x5000, 0xffff].map((address) => [
        String(address),
        getMemoryRegion(address),
      ]),
    ),
  },
};

console.log(JSON.stringify(view, null, 2));
