/**
 * ZPLC Communication Function Blocks
 *
 * Compiler-side definitions for all communication FBs (Modbus, MQTT, Cloud).
 *
 * API contract:
 *   - Members expose a `type` field (DataType) so callers can read `m.type`.
 *   - `generateCall(baseAddr, params, ctx)` — three-arg form expected by tests
 *     and by the compiler code-gen pipeline.
 *   - Kind IDs match firmware/lib/zplc_core/include/zplc_comm_dispatch.h.
 *
 * SPDX-License-Identifier: MIT
 */

import type { CodeGenContext } from './types';
import { DataType } from '../ast';

// ─── Local member/FB interfaces ──────────────────────────────────────────────
// We intentionally do not use FunctionBlockDef here so we can keep the
// `(baseAddr, params, ctx)` call signature the compiler tests assert on.

export interface CommMemberDef {
  name: string;
  /** DataType enum value (tests access this as `m.type`) */
  type: DataType;
  /** Byte offset from the FB base address */
  offset: number;
  isInput: boolean;
  isOutput: boolean;
}

export interface CommFBDef {
  name: string;
  size: number;
  members: CommMemberDef[];
  generateCall: (
    baseAddr: number,
    params: { name: string; value: any }[],
    ctx: CodeGenContext
  ) => void;
}

export const COMM_FB_KIND = {
  MB_READ_HREG: 0x0001,
  MB_WRITE_HREG: 0x0002,
  MB_READ_COIL: 0x0003,
  MB_WRITE_COIL: 0x0004,
  MQTT_CONNECT: 0x000a,
  MQTT_PUBLISH: 0x000b,
  MQTT_SUBSCRIBE: 0x000c,
  AZURE_C2D_RECV: 0x0020,
  AZURE_DPS_PROV: 0x0021,
  AZURE_EG_PUB: 0x0022,
  AWS_FLEET_PROV: 0x0030,
  SPB_REBIRTH: 0x0040,
} as const;

// ─── Registry ────────────────────────────────────────────────────────────────

export const CommBlocks: Record<string, CommFBDef> = {};

function reg(def: CommFBDef) {
  CommBlocks[def.name] = def;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inp(name: string, type: DataType, offset: number): CommMemberDef {
  return { name, type, offset, isInput: true, isOutput: false };
}
function out(name: string, type: DataType, offset: number): CommMemberDef {
  return { name, type, offset, isInput: false, isOutput: true };
}

/**
 * Write all bound input params into FB work-memory then emit OP_COMM_EXEC.
 * Signature: (baseAddr, params, ctx) to match the test contract.
 */
function emitCommFB(
  kind: number,
  def: CommFBDef,
  baseAddr: number,
  params: { name: string; value: any }[],
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
  ctx.emit(`    OP_COMM_EXEC 0x${kind.toString(16).padStart(4, '0')}`);
}

// ─── Common headers ──────────────────────────────────────────────────────────

// 8-byte handshake shared by ALL comm FBs
//  +0 EN(IN), +1 BUSY(OUT), +2 DONE(OUT), +3 ERROR(OUT), +4-7 STATUS(OUT DINT)
const COMM_HEADER: CommMemberDef[] = [
  inp('EN',     DataType.BOOL, 0),
  out('BUSY',   DataType.BOOL, 1),
  out('DONE',   DataType.BOOL, 2),
  out('ERROR',  DataType.BOOL, 3),
  out('STATUS', DataType.DINT, 4),
];

// Modbus-specific header (protocol byte + slave id + address)
const MB_HEADER: CommMemberDef[] = [
  ...COMM_HEADER,
  inp('PROTO',    DataType.USINT, 8),   // 0=TCP 1=RTU
  inp('SLAVE_ID', DataType.UINT,  9),
  inp('ADDR',     DataType.UINT,  11),
];

// TCP footer (HOST string at +18, PORT uint at +103)
const MB_TCP_FOOTER: CommMemberDef[] = [
  inp('HOST', DataType.STRING, 18),   // STRING[83] = 85 bytes
  inp('PORT', DataType.UINT,   103),
];

// ─── Phase 3: Modbus FBs ─────────────────────────────────────────────────────

reg({
  name: 'MB_READ_HREG', size: 110,
  // COUNT defines how many registers are requested. VALUE points at the first
  // register slot in FB memory; runtime handlers may fill subsequent words.
  members: [...MB_HEADER, inp('COUNT', DataType.UINT, 13), out('VALUE', DataType.UINT, 15), ...MB_TCP_FOOTER],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MB_READ_HREG, this, baseAddr, params, ctx); },
});

reg({
  name: 'MB_WRITE_HREG', size: 110,
  // COUNT supports multi-register writes. VALUE is the first write slot.
  members: [...MB_HEADER, inp('COUNT', DataType.UINT, 13), inp('VALUE', DataType.UINT, 15), ...MB_TCP_FOOTER],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MB_WRITE_HREG, this, baseAddr, params, ctx); },
});

reg({
  name: 'MB_READ_COIL', size: 110,
  members: [...MB_HEADER, inp('COUNT', DataType.UINT, 13), out('VALUE', DataType.BOOL, 15), ...MB_TCP_FOOTER],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MB_READ_COIL, this, baseAddr, params, ctx); },
});

reg({
  name: 'MB_WRITE_COIL', size: 110,
  members: [...MB_HEADER, inp('COUNT', DataType.UINT, 13), inp('VALUE', DataType.BOOL, 15), ...MB_TCP_FOOTER],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MB_WRITE_COIL, this, baseAddr, params, ctx); },
});

// ─── Phase 4: MQTT FBs ───────────────────────────────────────────────────────

// MQTT_CONNECT — 12 bytes
// +8 PROFILE USINT, +9 CONNECTED BOOL
reg({
  name: 'MQTT_CONNECT', size: 12,
  members: [...COMM_HEADER, inp('PROFILE', DataType.USINT, 8), out('CONNECTED', DataType.BOOL, 9)],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MQTT_CONNECT, this, baseAddr, params, ctx); },
});

// MQTT_PUBLISH — 190 bytes
// +8 QOS, +9 RETAIN, +10 _pad(2), +12 TOPIC STRING[80]=85 bytes, +97 PAYLOAD STRING[80]=85 bytes
reg({
  name: 'MQTT_PUBLISH', size: 190,
  members: [
    ...COMM_HEADER,
    inp('QOS',     DataType.USINT,  8),
    inp('RETAIN',  DataType.BOOL,   9),
    inp('TOPIC',   DataType.STRING, 12),
    inp('PAYLOAD', DataType.STRING, 97),
  ],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MQTT_PUBLISH, this, baseAddr, params, ctx); },
});

// MQTT_SUBSCRIBE — 190 bytes (mirrors PUBLISH, PAYLOAD is output)
reg({
  name: 'MQTT_SUBSCRIBE', size: 190,
  members: [
    ...COMM_HEADER,
    inp('QOS',     DataType.USINT,  8),
    out('VALID',   DataType.BOOL,   9),
    inp('TOPIC',   DataType.STRING, 12),
    out('PAYLOAD', DataType.STRING, 97),
  ],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.MQTT_SUBSCRIBE, this, baseAddr, params, ctx); },
});

// ─── Phase 5: Cloud Wrapper FBs ──────────────────────────────────────────────

// AZURE_C2D_RECV — 94 bytes
// +8 PAYLOAD STRING[80]=85 bytes, +93 VALID BOOL
reg({
  name: 'AZURE_C2D_RECV', size: 94,
  members: [...COMM_HEADER, out('PAYLOAD', DataType.STRING, 8), out('VALID', DataType.BOOL, 93)],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.AZURE_C2D_RECV, this, baseAddr, params, ctx); },
});

// AZURE_DPS_PROV — 201 bytes
// +8 DEVICE_ID STRING[63]=65 bytes, +73 ASSIGNED_HUB STRING[127]=129 bytes
reg({
  name: 'AZURE_DPS_PROV', size: 201,
  members: [
    ...COMM_HEADER,
    inp('DEVICE_ID',    DataType.STRING, 8),
    out('ASSIGNED_HUB', DataType.STRING, 73),
  ],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.AZURE_DPS_PROV, this, baseAddr, params, ctx); },
});

// AZURE_EG_PUB — 266 bytes
// +8 TOPIC STRING[63], +73 EVENT_TYPE STRING[63], +138 PAYLOAD STRING[127]
reg({
  name: 'AZURE_EG_PUB', size: 266,
  members: [
    ...COMM_HEADER,
    inp('TOPIC',      DataType.STRING, 8),
    inp('EVENT_TYPE', DataType.STRING, 73),
    inp('PAYLOAD',    DataType.STRING, 138),
  ],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.AZURE_EG_PUB, this, baseAddr, params, ctx); },
});

// AWS_FLEET_PROV — 137 bytes
// +8 TEMPLATE_NAME STRING[63], +73 THING_NAME STRING[63]
reg({
  name: 'AWS_FLEET_PROV', size: 137,
  members: [
    ...COMM_HEADER,
    inp('TEMPLATE_NAME', DataType.STRING, 8),
    out('THING_NAME',    DataType.STRING, 73),
  ],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.AWS_FLEET_PROV, this, baseAddr, params, ctx); },
});

// SPB_REBIRTH — 8 bytes (header only; rising EN triggers REBIRTH)
reg({
  name: 'SPB_REBIRTH', size: 8,
  members: [...COMM_HEADER],
  generateCall(baseAddr, params, ctx) { emitCommFB(COMM_FB_KIND.SPB_REBIRTH, this, baseAddr, params, ctx); },
});
