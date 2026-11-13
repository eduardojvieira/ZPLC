import { describe, expect, it } from 'bun:test';

import { COMMAND_LIST, INITIAL_COMMAND_STATE, commandById, isCommandEnabled, type CommandState } from './registry';

// LNK-008: the command that starts plant I/O mode is physical and ships disabled until U3 mounts the indicator.
const MODES: CommandState['mode'][] = ['simulate', 'hardware'];
const BOOLS = [false, true];
const VM_STATES = ['idle', 'running', 'paused', 'stopped', 'fault'];

function everyState(): CommandState[] {
  const states: CommandState[] = [];
  for (const mode of MODES)
    for (const connected of BOOLS)
      for (const compiled of BOOLS)
        for (const busy of BOOLS)
          for (const projectOpen of BOOLS)
            for (const vmState of VM_STATES)
              states.push({ ...INITIAL_COMMAND_STATE, mode, connected, compiled, busy, projectOpen, hasActiveFile: projectOpen, vmState });
  return states;
}

describe('online.feedBoardFromPlant (LNK-008)', () => {
  it('the command is physical and disabled in every registry state', () => {
    const command = commandById('online.feedBoardFromPlant');
    expect(command.physical).toBe(true);
    expect(command.category).toBe('online');
    const states = everyState();
    expect(states.length).toBeGreaterThan(100);
    expect(states.filter((state) => isCommandEnabled(command, state))).toEqual([]);
  });

  it('is the only addition to the online commands the 2.0 registry had, and sits next to online.connect', () => {
    const ids = COMMAND_LIST.map((command) => command.id);
    expect(ids.indexOf('online.feedBoardFromPlant')).toBe(ids.indexOf('online.connect') + 1);
  });
});
