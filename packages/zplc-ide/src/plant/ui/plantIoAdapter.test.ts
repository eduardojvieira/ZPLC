import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../../compiler';
import type { PlantMapV2 } from '../../plants/plantMap';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantCore } from '../contracts';
import { createFakeBoard, type FakeBoardOptions } from '../board/fakeBoard';
import { stubProjectLoader } from '../../test/dom';

await stubProjectLoader();
const { createPlantIoAdapter } = await import('./plantIoAdapter');

// One sensor and one command, enough to exercise every path of the link (LNK-007, LNK-008, LNK-010, LNK-014).
const layout = {
  ipiBase: 0,
  ipiSize: 128,
  opiBase: 0x1000,
  opiSize: 128,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
const debug: DebugMap = {
  version: '1.0.0',
  programName: 'Cell',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: layout,
  pou: {
    Cell: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: {
        Start: { addr: 8, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 1 },
        Run: { addr: 0x1008, type: 'BOOL', region: 'OPI', size: 1, bitOffset: 3 },
      },
    },
  },
};
const ioMap = listIoMap(debug);
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: {
    'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
    'pump.run': { direction: 'command', type: 'BOOL', point: 'Cell.Run' },
  },
};
const core = {
  stepMs: 5,
  signals: [],
  apply: () => undefined,
  advance: () => undefined,
  sense: () => ({ 'start.pressed': true }),
} as unknown as PlantCore;

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`timed out waiting for ${what}`);
};

function setup(options: FakeBoardOptions & { timeoutMs?: number; portFails?: boolean } = {}) {
  const board = createFakeBoard({ program: () => [true], ...options });
  const built = { count: 0 };
  const adapter = createPlantIoAdapter(() => {
    built.count++;
    if (options.portFails) throw new Error('no board link is connected');
    return { link: board.port, core, map, ioMap, scanMs: 10, frameMs: 5, timeoutMs: options.timeoutMs ?? 200 };
  });
  return { board, built, adapter };
}

describe('plant I/O adapter: the M6 controller behind the shell link (PLS-008, LNK-007, LNK-008, LNK-010, LNK-014)', () => {
  it('LNK-008 no controller exists before a person starts the mode, and nothing reaches the board', () => {
    const { board, built, adapter } = setup();
    expect(built.count).toBe(0);
    expect(adapter.state).toBe('off');
    expect(board.state.active).toBe(false);
    expect(board.received.length).toBe(0);
  });

  it('LNK-007 enter, frames, mirror on and off, stop and exit: the whole cycle maps to off, starting, running and off', async () => {
    const { board, built, adapter } = setup();
    const seen: string[] = [];
    adapter.subscribe(() => seen.push(adapter.state));
    await adapter.start();
    expect(built.count).toBe(1);
    expect(adapter.state).toBe('running');
    expect(seen).toContain('starting');
    expect(board.state.active).toBe(true);
    await until(() => board.received.length >= 3, 'frames');
    // LNK-014: the round trip of the link is the latency of the rail
    await until(() => adapter.latencyMs !== null, 'a measured latency');
    expect(adapter.latencyMs!.worst).toBeGreaterThanOrEqual(adapter.latencyMs!.last);
    // LNK-010: off by default, a person turns it on and off
    expect(adapter.mirroring).toBe(false);
    await adapter.setMirroring(true);
    expect(adapter.mirroring).toBe(true);
    expect(board.state.mirror).toBe(true);
    await adapter.setMirroring(false);
    expect(board.state.mirror).toBe(false);
    await adapter.stop();
    expect(adapter.state).toBe('off');
    expect(adapter.failure ?? null).toBeNull();
    expect(board.state.active).toBe(false);
    expect(board.state.mirror).toBe(false);
  });

  it('LNK-012 a firmware without the capability is a located failure and the board is never entered', async () => {
    const { board, adapter } = setup({ supported: false });
    await expect(adapter.start()).rejects.toThrow(/\S/);
    expect(adapter.state).toBe('failed');
    expect(adapter.failure).toBeTruthy();
    expect(board.state.active).toBe(false);
    expect(board.received.length).toBe(0);
  });

  it('LNK-018 a refused enter is a located failure and the board is left as it was', async () => {
    const { board, adapter } = setup({ maxSlots: 0 });
    await expect(adapter.start()).rejects.toThrow('slots');
    expect(adapter.state).toBe('failed');
    expect(adapter.failure).toContain('slots');
    expect(board.state.active).toBe(false);
    expect(board.received.length).toBe(0);
  });

  it('LNK-011 a board that stops answering ends the mode as TIMEOUT, located, and the board is told to leave', async () => {
    const { board, adapter } = setup({ timeoutMs: 20, beforeAnswer: () => new Promise<void>(() => undefined) });
    await adapter.start();
    await until(() => adapter.state === 'failed', 'the timeout');
    expect(adapter.failure).toContain('TIMEOUT');
    await until(() => !board.state.active, 'the exit request');
    expect(board.state.mirror).toBe(false);
  });

  it('LNK-011 a link lost mid-run ends the mode as LINK_LOST, mirroring off, located', async () => {
    const { board, adapter } = setup();
    await adapter.start();
    await adapter.setMirroring(true);
    board.raiseExit('LINK_LOST');
    expect(adapter.state).toBe('failed');
    expect(adapter.failure).toContain('LINK_LOST');
    expect(adapter.mirroring).toBe(false);
    expect(board.state.active).toBe(false);
  });

  it('LNK-011 a frame that fails mid-run ends the mode as PROTOCOL and leaves the board as it was', async () => {
    let frames = 0;
    const { board, adapter } = setup({
      beforeAnswer: () => {
        if (++frames === 3) throw new Error('the link dropped');
      },
    });
    await adapter.start();
    await until(() => adapter.state === 'failed', 'the failure');
    expect(adapter.failure).toContain('PROTOCOL');
    await until(() => !board.state.active, 'the exit request');
  });

  it('LNK-008 a missing board link is a located failure and no controller was built past it', async () => {
    const { built, adapter } = setup({ portFails: true });
    await expect(adapter.start()).rejects.toThrow('no board link is connected');
    expect(adapter.state).toBe('failed');
    expect(adapter.failure).toBe('no board link is connected');
    expect(built.count).toBe(1);
  });

  it('LNK-009 dispose (disconnect, project change, app close) stops a running mode and is harmless when off', async () => {
    const off = setup();
    await off.adapter.dispose();
    expect(off.board.state.active).toBe(false);
    const { board, adapter } = setup();
    await adapter.start();
    await adapter.setMirroring(true);
    await adapter.dispose();
    expect(board.state.active).toBe(false);
    expect(board.state.mirror).toBe(false);
    expect(adapter.state).toBe('off');
  });

  it('LNK-009 a person can start again after a failure, with a fresh entry', async () => {
    const { board, adapter } = setup();
    await adapter.start();
    board.raiseExit('TIMEOUT');
    expect(adapter.state).toBe('failed');
    await adapter.start();
    expect(adapter.state).toBe('running');
    expect(adapter.failure ?? null).toBeNull();
    await adapter.stop();
  });
});
