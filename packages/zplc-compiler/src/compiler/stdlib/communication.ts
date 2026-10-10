/**
 * ZPLC Communication Function Blocks
 *
 * Compiler-side definitions for all communication FBs (Modbus, MQTT, Cloud).
 *
 * API contract:
 *   - Members expose a `type` field (DataType) so callers can read `m.type`.
 *   - `generateCall(baseAddr, params, ctx)` — three-arg form expected by tests
 *     and by the compiler code-gen pipeline.
 *   - Kind IDs, instance sizes and member offsets come from the generated contract
 *     (tools/contract/contract.json), the source of zplc_comm_dispatch.h.
 *
 * SPDX-License-Identifier: MIT
 */

import type { FBParameter, DataTypeValue } from '../ast';
import { DataType } from '../ast';
import type { CodeGenContext, FunctionBlockDef, MemberDef, MemberSize } from './types';
import { COMM_BLOCKS, COMM_FB_KIND as GENERATED_COMM_FB_KIND } from '../../contract.generated';

type CommGenerateCall = {
  (ctx: CodeGenContext, params: FBParameter[]): void;
  (baseAddr: number, params: FBParameter[], ctx: CodeGenContext): void;
};

export interface CommMemberDef extends MemberDef {
  name: string;
  /** DataType enum value (tests access this as `m.type`) */
  type: DataTypeValue;
  /** Compiler-facing alias used by generic stdlib member resolution */
  dataType: DataTypeValue;
  size: MemberSize;
  /** Byte offset from the FB base address */
  offset: number;
  isInput: boolean;
  isOutput: boolean;
  isInternal: false;
}

export interface CommFBDef extends FunctionBlockDef {
  name: string;
  size: number;
  members: CommMemberDef[];
  generateCall: CommGenerateCall;
}

export const COMM_FB_KIND = GENERATED_COMM_FB_KIND;

// ─── Registry ────────────────────────────────────────────────────────────────

export const CommBlocks: Record<string, CommFBDef> = {};

function reg(def: CommFBDef) {
  CommBlocks[def.name] = def;
}

/** Member of a generated block layout, with the IEC type name resolved to the compiler's DataType. */
function member(entry: (typeof COMM_BLOCKS)[number]['members'][number]): CommMemberDef {
  const type = DataType[entry.type as keyof typeof DataType];
  if (type === undefined) {
    throw new Error(`Unknown data type ${entry.type} for ${entry.name} in the generated contract`);
  }
  return {
    name: entry.name,
    type,
    dataType: type,
    size: entry.size as MemberSize,
    offset: entry.offset,
    isInput: entry.direction === 'in',
    isOutput: entry.direction === 'out',
    isInternal: false,
  };
}

/**
 * Write all bound input params into FB work-memory then emit COMM_EXEC.
 * Signature: (baseAddr, params, ctx) to match the test contract.
 */
function emitCommFB(
  kind: number,
  def: CommFBDef,
  baseAddr: number,
  params: FBParameter[],
  ctx: CodeGenContext
): void {
  ctx.emit(`    ; ${def.name}: write inputs`);
  for (const param of params) {
    const member = def.members.find(m => m.name === param.name);
    if (!member || !member.isInput) continue;

    ctx.emitExpression(param.value);
    switch (member.type) {
      case DataType.BOOL:
      case DataType.USINT:
        ctx.emit(`    STORE8 ${baseAddr + member.offset}`);
        break;
      case DataType.UINT:
      case DataType.INT:
      case DataType.WORD:
        ctx.emit(`    STORE16 ${baseAddr + member.offset}`);
        break;
      default:
        ctx.emit(`    STORE32 ${baseAddr + member.offset}`);
    }
  }

  ctx.emit(`    ; ${def.name}: dispatch (kind=0x${kind.toString(16)})`);
  ctx.emit(`    PUSH16 ${baseAddr}`);
  ctx.emit(`    COMM_EXEC 0x${kind.toString(16).padStart(4, '0')}`);
}

function defineCommFB(definition: Omit<CommFBDef, 'generateCall'>, kind: number): CommFBDef {
  const def = definition as CommFBDef;

  function generateCall(ctx: CodeGenContext, params: FBParameter[]): void;
  function generateCall(baseAddr: number, params: FBParameter[], ctx: CodeGenContext): void;
  function generateCall(
    arg1: number | CodeGenContext,
    params: FBParameter[],
    arg3?: CodeGenContext
  ): void {
    if (typeof arg1 === 'number') {
      if (!arg3) {
        throw new Error(`Missing code generation context for ${def.name}`);
      }
      emitCommFB(kind, def, arg1, params, arg3);
      return;
    }

    emitCommFB(kind, def, arg1.baseAddress, params, arg1);
  }

  def.generateCall = generateCall;
  return def;
}

// ─── Function blocks from the generated contract ─────────────────────────────

// Every block starts with the 8-byte handshake: +0 EN(IN), +1 BUSY(OUT),
// +2 DONE(OUT), +3 ERROR(OUT), +4-7 STATUS(OUT DINT). The layouts, sizes and
// kind identifiers are in tools/contract/contract.json.
for (const block of COMM_BLOCKS) {
  reg(defineCommFB({
    name: block.name,
    size: block.size,
    members: block.members.map(member),
  }, block.kind));
}
