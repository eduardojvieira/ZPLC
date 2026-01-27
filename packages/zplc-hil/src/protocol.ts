export type DebugFrameType = 'opcode' | 'fb' | 'task' | 'error' | 'cycle' | 'ack' | 'watch' | 'ready' | 'status';

export interface BasePayload {
  t: DebugFrameType;
}

export interface OpcodePayload extends BasePayload {
  t: 'opcode';
  op: string;
  pc: number;
  sp: number;
  tos: number;
}

export interface FBPayload extends BasePayload {
  t: 'fb';
  name: string;
  id: number;
  q: boolean;
  et?: number;
  cv?: number;
}

export interface TaskPayload extends BasePayload {
  t: 'task';
  id: number;
  start: number;
  end: number;
  us: number;
  ovr: boolean;
}

export interface CyclePayload extends BasePayload {
  t: 'cycle';
  n: number;
  us: number;
  tasks: number;
}

export interface ErrorPayload extends BasePayload {
  t: 'error';
  code: number;
  msg: string;
  pc: number;
}

export interface AckPayload extends BasePayload {
  t: 'ack';
  cmd: string;
  val: string;
  ok: boolean;
  err?: string;
}

export interface WatchPayload extends BasePayload {
  t: 'watch';
  addr: number;
  type: string;
  val: any;
}

export interface ReadyPayload extends BasePayload {
  t: 'ready';
  fw: string;
  caps: string[];
}

export interface StatusPayload extends BasePayload {
  t: 'status';
  mode: string;
  cycles: number;
  uptime: number;
}

export type DebugPayload = 
  | OpcodePayload 
  | FBPayload 
  | TaskPayload 
  | CyclePayload 
  | ErrorPayload 
  | AckPayload
  | WatchPayload
  | ReadyPayload
  | StatusPayload;

export interface DebugFrame {
  type: DebugFrameType;
  timestamp: number;
  raw: string;
  payload: DebugPayload;
}

export function parseFrame(line: string): DebugFrame | null {
  const cleanLine = line.trim();
  if (!cleanLine.startsWith('{') || !cleanLine.endsWith('}')) {
    return null;
  }

  try {
    const payload = JSON.parse(cleanLine) as DebugPayload;
    if (!payload.t) return null;

    return {
      type: payload.t,
      timestamp: Date.now(),
      raw: cleanLine,
      payload
    };
  } catch {
    return null;
  }
}
