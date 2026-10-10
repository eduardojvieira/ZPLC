// The generated TypeScript contract module against the frozen snapshot of the hand-written tables (WP-11, VF-012).
//
//   bun test ./tools/contract
//
// golden/contract.golden.json holds the numbers the C header, the compiler and the IDE had before they were
// generated. A generated table that moves a number fails here.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import * as contract from '../../packages/zplc-compiler/src/contract.generated.ts';
import { getDataTypeSize } from '../../packages/zplc-compiler/src/compiler/ast.ts';
import { MEMORY_MAP, getForceRegionBounds, getMemoryRegion } from '../../packages/zplc-ide/src/runtime/debugAdapter.ts';
import { VM_ERRORS, describeVmError } from '../../packages/zplc-ide/src/runtime/nativeTrace.ts';

const golden = JSON.parse(readFileSync(new URL('./golden/contract.golden.json', import.meta.url), 'utf8'));
const macros: Record<string, number> = golden.c.macros;
const cEnum = (typedef: string): Record<string, number> => golden.c.enums[typedef];
const stripped = (entries: Record<string, number>, prefix: string) =>
  Object.fromEntries(Object.entries(entries).map(([name, value]) => [name.replace(prefix, ''), value]));

describe('generated TypeScript contract equals the frozen snapshot', () => {
  test('opcode numbers', () => {
    expect<unknown>({ ...contract.Opcode }).toEqual(stripped(cEnum('zplc_opcode_t'), 'OP_'));
    expect(contract.OPCODE_TABLE.map((entry) => entry.name)).toEqual(Object.keys(contract.Opcode));
    expect(contract.OPCODE_TABLE.map((entry) => entry.code)).toEqual(Object.values(contract.Opcode));
  });

  test('operand size of every byte value, as the C helper decodes it', () => {
    for (let byte = 0; byte < 256; byte++) {
      expect(contract.getOperandSize(byte)).toBe(golden.c.operand[String(byte)].operand);
    }
  });

  test('operand size recorded per opcode is the size the decoder gives it', () => {
    for (const entry of contract.OPCODE_TABLE) expect(entry.operand).toBe(contract.getOperandSize(entry.code));
  });

  test('stack effect flags: relative and absolute jumps are what the compiler treated as jumps', () => {
    const flagged = (flag: string) => contract.OPCODE_TABLE.filter((entry) => entry.flags.includes(flag)).map((entry) => entry.code);
    expect(flagged('relative')).toEqual(golden.compiler.relativeJumps);
    expect([...flagged('relative'), ...flagged('absolute')].sort((a, b) => a - b)).toEqual(golden.compiler.addressOperands);
  });

  test('container constants and layouts', () => {
    expect<unknown>(contract.CONTAINER.magic).toBe(macros.ZPLC_MAGIC);
    expect<unknown>(contract.ABI_VERSION).toEqual({ major: macros.ZPLC_VERSION_MAJOR, minor: macros.ZPLC_VERSION_MINOR });
    expect<unknown>(contract.DRAFT_COUNTER).toBe(macros.ZPLC_DRAFT_COUNTER);
    expect(contract.DRAFT_COUNTER).toBe(golden.compiler.constants.DRAFT_COUNTER);
    expect(contract.CONTAINER_LAYOUT.header.draft_counter).toEqual({ offset: golden.compiler.constants.DRAFT_COUNTER_OFFSET, size: 4 });
    expect<unknown>(contract.CONTAINER.headerSize).toBe(macros.ZPLC_FILE_HEADER_SIZE);
    expect<unknown>(contract.CONTAINER.segmentEntrySize).toBe(macros.ZPLC_SEGMENT_ENTRY_SIZE);
    expect<unknown>(contract.CONTAINER.taskDefSize).toBe(macros.ZPLC_TASK_DEF_SIZE);
    expect<unknown>(contract.CONTAINER.iomapEntrySize).toBe(macros.ZPLC_IOMAP_ENTRY_SIZE);
    expect<unknown>(contract.CONTAINER.tagEntrySize).toBe(macros.ZPLC_TAG_ENTRY_SIZE);
    expect<unknown>(contract.CONTAINER.maxTasks).toBe(macros.ZPLC_LOADER_MAX_TASKS);
    const byTypedef: Record<string, keyof typeof contract.CONTAINER_LAYOUT> = {
      zplc_file_header_t: 'header', zplc_segment_entry_t: 'segment', zplc_task_def_t: 'task',
      zplc_iomap_entry_t: 'iomap', zplc_tag_entry_t: 'tag',
    };
    for (const [typedef, key] of Object.entries(byTypedef)) {
      const offsets = Object.fromEntries(Object.entries(contract.CONTAINER_LAYOUT[key]).map(([field, info]) => [field, info.offset]));
      expect(offsets).toEqual(golden.c.structs[typedef].offsets);
    }
  });

  test('segment, task, tag, io and flag identifiers', () => {
    expect<unknown>({ ...contract.SEGMENT_TYPE }).toEqual(stripped(cEnum('zplc_segment_type_t'), 'ZPLC_SEG_'));
    expect<unknown>({ ...contract.TASK_TYPE_ID }).toEqual(stripped(cEnum('zplc_task_type_t'), 'ZPLC_TASK_'));
    expect<unknown>({ ...contract.IO_DIRECTION }).toEqual(stripped(cEnum('zplc_io_direction_t'), 'ZPLC_IO_'));
    expect<unknown>({ ...contract.TAG_ID }).toEqual(stripped(cEnum('zplc_tag_id_t'), 'ZPLC_TAG_'));
    expect<unknown>({ ...contract.FILE_FLAG }).toEqual(stripped(cEnum('zplc_file_flags_t'), 'ZPLC_FLAG_'));
  });

  test('memory regions, limits and system registers', () => {
    for (const [name, region] of Object.entries(contract.MEMORY_REGION)) {
      expect<unknown>(region.base).toBe(macros[`ZPLC_MEM_${name}_BASE`]);
      expect<unknown>(region.size).toBe(macros[`ZPLC_MEM_${name}_SIZE`]);
    }
    expect<unknown>(contract.MEMORY_LIMIT).toEqual({
      maxTags: macros.ZPLC_MAX_TAGS, stackMaxDepth: macros.ZPLC_STACK_MAX_DEPTH,
      callStackMax: macros.ZPLC_CALL_STACK_MAX, maxBreakpoints: macros.ZPLC_MAX_BREAKPOINTS,
    });
    expect<unknown>(contract.SYSTEM_REGISTER.CYCLE_TIME.address).toBe(macros.ZPLC_SYS_CYCLE_TIME);
    expect<unknown>(contract.SYSTEM_REGISTER.UPTIME.address).toBe(macros.ZPLC_SYS_UPTIME);
    expect<unknown>(contract.SYSTEM_REGISTER.TASK_ID.address).toBe(macros.ZPLC_SYS_TASK_ID);
    expect<unknown>(contract.SYSTEM_REGISTER.FLAGS.address).toBe(macros.ZPLC_SYS_FLAGS);
    expect<unknown>(contract.SYSTEM_FLAG.FIRST_SCAN).toBe(macros.ZPLC_SYS_FLAG_FIRST_SCAN);
    expect<unknown>(contract.SYSTEM_FLAG.RUNNING).toBe(macros.ZPLC_SYS_FLAG_RUNNING);
  });

  test('data type identifiers are the ones the compiler writes into tags and the I/O map', () => {
    expect<unknown>({ ...contract.DATA_TYPE_ID }).toEqual(stripped(cEnum('zplc_data_type_t'), 'ZPLC_TYPE_'));
    for (const [name, id] of Object.entries(golden.compiler.typeIds)) {
      expect((contract.DATA_TYPE_ID as Record<string, number>)[name]).toBe(id as number);
    }
    expect<unknown>(contract.STRING_LAYOUT.dataOffset).toBe(macros.ZPLC_STRING_DATA_OFFSET);
    expect<unknown>(contract.STRING_LAYOUT.defaultSize).toBe(macros.ZPLC_STRING_DEFAULT_SIZE);
    expect(contract.STRING_LAYOUT.defaultTotalSize).toBe(85);
  });

  test('error codes of the VM and of the loader', () => {
    expect<unknown>(Object.fromEntries(contract.VM_ERRORS.map((entry) => [entry.name, entry.code]))).toEqual(cEnum('zplc_vm_error_t'));
    const loader = Object.fromEntries(Object.entries(macros).filter(([name]) => name.startsWith('ZPLC_LOADER_ERR_') || name === 'ZPLC_LOADER_OK'));
    expect<unknown>(Object.fromEntries(contract.LOADER_ERRORS.map((entry) => [entry.name, entry.code]))).toEqual(loader);
  });

  test('function-block kinds, sizes and member offsets', () => {
    expect({ ...contract.COMM_FB_KIND }).toEqual(golden.compiler.commKinds);
    const kinds = stripped(cEnum('zplc_comm_fb_kind_t'), 'ZPLC_COMM_FB_');
    delete kinds.KIND_MAX;
    expect<unknown>({ ...contract.COMM_KIND }).toEqual(kinds);
    expect(contract.COMM_KIND_MAX).toBe(cEnum('zplc_comm_fb_kind_t').ZPLC_COMM_FB_KIND_MAX);
    expect(contract.COMM_BLOCKS.map((block) => block.name).sort()).toEqual(Object.keys(golden.compiler.commBlocks).sort());
    for (const block of contract.COMM_BLOCKS) {
      const expected = golden.compiler.commBlocks[block.name];
      expect(block.size).toBe(expected.size);
      expect(block.members.map(({ name, type, offset, size, direction }) => ({ name, type, offset, size, direction })))
        .toEqual(expected.members);
    }
  });

  test('the compiler allocates each fixed-size type with the size the contract gives it', () => {
    for (const [name, size] of Object.entries(contract.DATA_TYPE_SIZE)) {
      if (name === 'NONE') continue;
      expect(getDataTypeSize(name as never)).toBe(size);
    }
    expect(getDataTypeSize('STRING')).toBe(contract.STRING_LAYOUT.defaultTotalSize);
  });

});

describe('IDE runtime tables follow the generated contract', () => {
  test('memory map bases and sizes', () => {
    for (const [name, info] of Object.entries(MEMORY_MAP)) {
      expect(info.baseAddress).toBe(macros[`ZPLC_MEM_${name.toUpperCase()}_BASE`]);
      expect(info.size).toBe(macros[`ZPLC_MEM_${name.toUpperCase()}_SIZE`]);
    }
  });

  test('region lookup and force bounds give what the adapters computed with literals', () => {
    for (let address = 0; address < 0x10000; address += 0x1D) {
      // The rule the native and serial adapters wrote out by hand before it came from the contract.
      const regionStart = address < 0x1000 ? 0 : address < 0x2000 ? 0x1000 : address < 0x4000 ? 0x2000 : 0x4000;
      const regionEnd = regionStart === 0 ? 0x1000 : regionStart === 0x1000 ? 0x2000 : regionStart === 0x2000 ? 0x4000 : 0x5000;
      expect(getForceRegionBounds(address)).toEqual({ start: regionStart, end: regionEnd });
      const region = address < 0x1000 ? 'ipi' : address < 0x2000 ? 'opi' : address < 0x4000 ? 'work' : address < 0x5000 ? 'retain' : 'code';
      expect(getMemoryRegion(address)).toBe(region);
    }
    expect(getMemoryRegion(-1)).toBeNull();
    expect(getMemoryRegion(0x10000)).toBeNull();
  });

  test('the Console names every VM error of the contract in plain words', () => {
    expect(VM_ERRORS.map((entry) => entry.name)).toEqual(contract.VM_ERRORS.map((entry) => entry.name));
    for (const entry of VM_ERRORS) {
      expect(describeVmError(entry.code)).toBe(`${entry.code} ${entry.label}`);
      expect(entry.label).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
    expect(describeVmError(0x0a)).toBe('10 paused');
  });
});
