import { DebugFrame, OpcodePayload, WatchPayload, ErrorPayload } from './protocol';

export interface TimingSpec {
  afterMs: number;
  tolerancePercent: number;
}

export function assertPattern(frames: DebugFrame[], pattern: RegExp): boolean {
  return frames.some(f => pattern.test(f.raw));
}

export function assertValue(frames: DebugFrame[], addr: number, expected: any): boolean {
  // Look for WATCH frames or memory dumps (if implemented)
  // For now, assume WATCH frames
  const watches = frames.filter(f => f.type === 'watch') as DebugFrame[];
  
  // Find last value for this address
  const lastWatch = watches
    .map(f => f.payload as WatchPayload)
    .filter(p => p.addr === addr)
    .pop();

  if (!lastWatch) return false;
  return lastWatch.val === expected;
}

export function assertError(frames: DebugFrame[], code: number): boolean {
  return frames.some(f => 
    f.type === 'error' && (f.payload as ErrorPayload).code === code
  );
}

export function assertNoError(frames: DebugFrame[]): boolean {
  // Ignore benign errors if any (e.g. HALTED is an error code but might be expected)
  // But HALTED is code 0x09.
  return !frames.some(f => 
    f.type === 'error' && (f.payload as ErrorPayload).code !== 0x09 // Ignore HALTED
  );
}

export function assertTiming(frames: DebugFrame[], spec: TimingSpec): boolean {
  if (frames.length < 2) return false;
  
  const start = frames[0].timestamp;
  const end = frames[frames.length - 1].timestamp;
  const duration = end - start;
  
  const min = spec.afterMs * (1 - spec.tolerancePercent / 100);
  const max = spec.afterMs * (1 + spec.tolerancePercent / 100);
  
  return duration >= min && duration <= max;
}
