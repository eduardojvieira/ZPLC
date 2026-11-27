import { useEffect } from 'react';
import { bindCommands, getCommandState } from '../bus';
import { requestFeedBoard } from '../../store/ioModeStatus';

/** Plant commands bound here: P8's "Feed the board from the plant" only asks; the dialog starts it (LNK-008). P5 adds the edit ones. */
export function usePlantEditCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'plant.feedBoard': () => {
          const state = getCommandState();
          if (state.mode === 'hardware' && state.connected && state.plantFeedable) requestFeedBoard(true);
        },
      }),
    [],
  );
}
