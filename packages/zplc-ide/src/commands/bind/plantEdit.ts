import { useEffect } from 'react';
import { bindCommands, getCommandState } from '../bus';
import type { CommandHandler } from '../bus';
import { requestFeedBoard } from '../../store/ioModeStatus';

const ask = (): void => {
  const state = getCommandState();
  if (state.mode === 'hardware' && state.connected && state.plantFeedable) requestFeedBoard(true);
};

/**
 * `plant.feedBoard` is declared for the plant document's button and stays unbound, so the menu and the palette list the action once.
 * Bound here: "Feed the board from the plant" only asks; the dialog starts it (LNK-008). P5 adds the edit ones.
 */
export const plantEditHandlers = (): Partial<Record<'online.feedBoardFromPlant', CommandHandler>> => ({
  'online.feedBoardFromPlant': ask,
});

export function usePlantEditCommands(): void {
  useEffect(() => bindCommands(plantEditHandlers()), []);
}
