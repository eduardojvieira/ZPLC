import { describe, expect, it } from 'bun:test';

import { COMMAND_LIST, INITIAL_COMMAND_STATE, commandById, isCommandEnabled, type CommandState } from './registry';

// LNK-008: the commands that offer plant I/O mode are physical, and only open its confirmation. They are enabled only in hardware mode,
// with a connected board that has the PLANT capability, while a plant is loaded and no simulation drives it (`plantFeedable`).
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
            for (const plantFeedable of BOOLS)
              for (const vmState of VM_STATES)
                states.push({
                  ...INITIAL_COMMAND_STATE,
                  mode,
                  connected,
                  compiled,
                  busy,
                  projectOpen,
                  hasActiveFile: projectOpen,
                  vmState,
                  plantFeedable,
                });
  return states;
}

describe('online.feedBoardFromPlant and plant.feedBoard (LNK-008)', () => {
  it.each(['online.feedBoardFromPlant', 'plant.feedBoard'] as const)(
    '%s is physical and enabled only in hardware mode, connected, idle, with a feedable plant',
    (id) => {
      const command = commandById(id);
      expect(command.physical).toBe(true);
      expect(command.category).toBe('online');
      const states = everyState();
      expect(states.length).toBeGreaterThan(100);
      const enabled = states.filter((state) => isCommandEnabled(command, state));
      expect(enabled.length).toBeGreaterThan(0);
      for (const state of enabled) {
        expect([state.mode, state.connected, state.busy, state.plantFeedable]).toEqual(['hardware', true, false, true]);
      }
      // the 2.0 start state, and every state without a feedable plant, leave it disabled
      expect(isCommandEnabled(command, INITIAL_COMMAND_STATE)).toBe(false);
      expect(states.filter((state) => !state.plantFeedable && isCommandEnabled(command, state))).toEqual([]);
    },
  );

  it('is the only addition to the online commands the 2.0 registry had, and sits next to online.connect', () => {
    const ids = COMMAND_LIST.map((command) => command.id);
    expect(ids.indexOf('online.feedBoardFromPlant')).toBe(ids.indexOf('online.connect') + 1);
  });
});
