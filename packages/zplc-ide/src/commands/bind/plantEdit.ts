import { useEffect } from 'react';
import { bindCommands, getCommandState } from '../bus';
import type { CommandHandler } from '../bus';
import { t } from '../../i18n';
import { usePlantEdit } from '../../plant/editSession';
import { requestFeedBoard } from '../../store/ioModeStatus';
import { usePlantDocument } from '../../store/usePlantDocument';
import { announce } from '../../utils/announce';

const ask = (): void => {
  const state = getCommandState();
  if (state.mode === 'hardware' && state.connected && state.plantFeedable) requestFeedBoard(true);
};

/** What the plant document on screen offers the commands: start and end the edit of its scene (PLS-004, PLS-005). */
export interface PlantEditing {
  edit(): void;
  done(): void;
}

let shown: PlantEditing | null = null;

/** Offered by a plant document while it is on screen; the returned function withdraws exactly this offer. */
export function offerPlantEditing(offer: PlantEditing): () => void {
  shown = offer;
  return () => {
    if (shown === offer) shown = null;
  };
}

let visualHistory: ((direction: 'undo' | 'redo') => boolean) | null = null;

/**
 * Offered by the editor area while it is mounted: undoes or redoes the history of the active visual editor (LD, FBD, SFC) and says
 * whether it did anything, so a text file is left to the code editor.
 */
export function offerVisualHistory(apply: (direction: 'undo' | 'redo') => boolean): () => void {
  visualHistory = apply;
  return () => {
    if (visualHistory === apply) visualHistory = null;
  };
}

/**
 * Undo and Redo of the Edit menu act on the plant edit session only when the plant document is the active document and a scene is
 * being edited (SCN-010); in any other case the code editor that has the focus keeps its own history. The code editor's module is
 * loaded when it is asked for: a code editor that has the focus has loaded it already.
 */
const history =
  (direction: 'undo' | 'redo'): CommandHandler =>
  async () => {
    const session = usePlantEdit.getState();
    if (usePlantDocument.getState().active && session.editor) {
      if (session.running)
        announce(t('plantEditor.running')); // SCN-008: nothing is edited while the plant runs
      else session[direction]();
      return;
    }
    const { monacoEditor } = await import('../../components/monacoRuntime');
    const editors = monacoEditor.getEditors();
    (editors.find((editor) => editor.hasTextFocus()) ?? editors[0])?.trigger('edit.menu', direction, null);
  };

/**
 * `plant.feedBoard` is declared for the plant document's button and stays unbound, so the menu and the palette list the action once.
 * Bound here: "Feed the board from the plant" only asks; the dialog starts it (LNK-008). The edit ones are the Edit menu's.
 */
export const plantEditHandlers = (): Partial<
  Record<'online.feedBoardFromPlant' | 'plant.edit' | 'plant.endEdit' | 'edit.undo' | 'edit.redo', CommandHandler>
> => ({
  'online.feedBoardFromPlant': ask,
  'plant.edit': () => shown?.edit(),
  'plant.endEdit': () => shown?.done(),
  'edit.undo': history('undo'),
  'edit.redo': history('redo'),
});

export function usePlantEditCommands(): void {
  useEffect(() => bindCommands(plantEditHandlers()), []);
}
