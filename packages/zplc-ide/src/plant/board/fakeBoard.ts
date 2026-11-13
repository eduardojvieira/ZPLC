/**
 * @file fakeBoard.ts
 * @brief A TypeScript model of the plant I/O contract of the firmware (R-M6-1 to R-M6-7), for Studio's tests.
 *
 * It is the evidence of Studio's side only, never of the firmware: it knows the rules, not the timing or the pins. It
 * implements `PlantBoardPort`, so a test never opens a serial port (LNK-008, LNK-009).
 */
import { LinkError } from '../../runtime/link/deviceLink';
import { ERROR } from '../../runtime/link/protocol.generated';
import { MEMORY_MAP } from '../../runtime/debugAdapter';
import { packValues, unpackValues, valueBytes, type SlotValue } from './frameCodec';
import type {
  PlantBoardPort,
  PlantEnterGrant,
  PlantEnterRequest,
  PlantExitEvent,
  PlantExitReasonName,
  PlantFrameResult,
  PlantSlotDescriptor,
} from './portTypes';

const SYSTEM_REGISTER_OFFSET = 0x0ff0;
const WIDTH = { BOOL: 1, INT: 2, REAL: 4 } as const;

export interface FakeBoardOptions {
  supported?: boolean;
  maxSlots?: number;
  /** One board scan: the latched inputs in descriptor order to the outputs in descriptor order. Default: all outputs zero. */
  program?: (inputs: SlotValue[]) => SlotValue[];
  /** Board scans per frame; more than one counts the extra ones `late` (a scan with no new frame). */
  scansPerFrame?: number;
  /** Runs before a frame is answered: delay it, never resolve it, or throw. */
  beforeAnswer?: (seq: number) => Promise<void> | void;
}

const refuse = (name: keyof typeof ERROR, message: string) => new LinkError(message, ERROR[name], name);

export function createFakeBoard(options: FakeBoardOptions = {}) {
  const maxSlots = options.maxSlots ?? 32;
  const listeners = new Set<(event: PlantExitEvent) => void>();
  const state = {
    active: false,
    mirror: false,
    plantId: 0,
    seq: undefined as number | undefined,
    inputs: [] as PlantSlotDescriptor[],
    outputs: [] as PlantSlotDescriptor[],
    latched: [] as SlotValue[],
    outputValues: [] as SlotValue[],
    frames: 0,
    late: 0,
    lateAtLastAnswer: 0,
    scans: 0,
    rejected: 0,
    rejectedInARow: 0,
  };
  /** Every accepted frame, in arrival order. */
  const received: { seq: number; inputs: SlotValue[] }[] = [];

  const finish = (reason: PlantExitReasonName) => {
    state.active = false;
    state.mirror = false;
    listeners.forEach((listener) => listener({ reason, frames: state.frames }));
  };

  const checkSlots = (slots: readonly PlantSlotDescriptor[], size: number, what: string, limit: number) => {
    const owned = new Map<number, string>();
    for (const slot of slots) {
      if (slot.offset + WIDTH[slot.type] > Math.min(size, limit)) throw refuse('RANGE', `a ${what} lies outside its image`);
      for (let b = 0; b < WIDTH[slot.type]; b++) {
        const key = slot.offset + b;
        const mine = slot.type === 'BOOL' ? `bit${slot.bit ?? 0}` : 'all';
        const other = owned.get(key);
        if (other !== undefined && (other === 'all' || mine === 'all' || other === mine)) throw refuse('RANGE', `two ${what}s overlap`);
        owned.set(key, other === undefined ? mine : 'all');
      }
    }
  };

  const reject = (message: string): never => {
    state.rejected++;
    if (++state.rejectedInARow >= 8) finish('PROTOCOL');
    throw refuse('BAD_REQUEST', message);
  };

  const scan = (latch: boolean) => {
    if (latch) state.latched = received.at(-1)!.inputs;
    else state.late++;
    state.scans++;
    state.outputValues = (options.program ?? (() => state.outputs.map((o) => (o.type === 'BOOL' ? false : 0))))(state.latched);
  };

  const port: PlantBoardPort = {
    supported: () => options.supported ?? true,
    async enter(request: PlantEnterRequest): Promise<PlantEnterGrant> {
      if (state.active) throw refuse('STATE', 'plant I/O mode is already active');
      const { inputs, outputs } = request;
      if (inputs.length > maxSlots || outputs.length > maxSlots || inputs.length + outputs.length === 0)
        throw refuse('BAD_REQUEST', 'the number of slots is out of range');
      checkSlots(inputs, MEMORY_MAP.ipi.size, 'input', SYSTEM_REGISTER_OFFSET);
      checkSlots(outputs, MEMORY_MAP.opi.size, 'output', Infinity);
      Object.assign(state, {
        active: true,
        mirror: false,
        plantId: state.plantId + 1,
        seq: undefined,
        inputs: [...inputs],
        outputs: [...outputs],
        latched: inputs.map((i) => (i.type === 'BOOL' ? false : 0)),
        frames: 0,
        late: 0,
        lateAtLastAnswer: 0,
        scans: 0,
        rejected: 0,
        rejectedInARow: 0,
      });
      received.length = 0;
      state.outputValues = outputs.map((o) => (o.type === 'BOOL' ? false : 0));
      return {
        plantId: state.plantId,
        inBytes: valueBytes(inputs),
        outBytes: valueBytes(outputs),
        maxSlots,
        timeoutMs: Math.min(2000, Math.max(50, request.timeoutMs)),
      };
    },
    async frame(plantId, seq, values): Promise<PlantFrameResult> {
      if (!state.active) throw refuse('STATE', 'plant I/O mode is not active');
      if (plantId !== state.plantId) reject('the plant id is not the current entry');
      let inputs: SlotValue[] = [];
      try {
        inputs = unpackValues(state.inputs, values);
      } catch (error) {
        reject((error as Error).message);
      }
      const ahead = ((seq - (state.seq ?? seq - 1)) | 0) >>> 0;
      if (state.seq !== undefined && (ahead === 0 || ahead > 0x7fffffff)) reject('the sequence is not newer');
      state.seq = seq;
      state.rejectedInARow = 0;
      state.frames++;
      received.push({ seq, inputs });
      await options.beforeAnswer?.(seq);
      if (!state.active) throw refuse('STATE', 'plant I/O mode ended');
      const answer: PlantFrameResult = {
        appliedSeq: seq,
        scans: state.scans,
        flags: (state.mirror ? 1 : 0) | (state.late > state.lateAtLastAnswer ? 2 : 0),
        late: state.late,
        rejected: state.rejected,
        values: packValues(state.outputs, state.outputValues),
      };
      state.lateAtLastAnswer = state.late;
      // The board scans after answering: the next response carries what these scans produced.
      for (let i = 0; i < (options.scansPerFrame ?? 1); i++) scan(i === 0);
      return answer;
    },
    async exit() {
      if (!state.active) throw refuse('STATE', 'plant I/O mode is not active');
      state.active = false;
      state.mirror = false;
      return { reason: 'CLOSED' as const, frames: state.frames, late: state.late, rejected: state.rejected };
    },
    async mirror(on) {
      if (!state.active) throw refuse('STATE', 'plant I/O mode is not active');
      state.mirror = on;
      return state.mirror;
    },
    onExit(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    received,
    state,
    /** The device ends the mode by itself (EVT_PLANT_EXIT). */
    raiseExit: (reason: PlantExitReasonName) => state.active && finish(reason),
  };
}
