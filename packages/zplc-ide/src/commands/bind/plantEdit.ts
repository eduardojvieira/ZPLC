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

/** A field with a history of its own: an input or text area that is not the hidden text area of a code editor. */
const isPlainField = (element: Element | null): boolean =>
  (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && !element.closest('.monaco-editor');

/**
 * Undo and Redo of the Edit menu go, in this order, to: a focused plain text field (its own history, which on macOS the menu key is
 * what reaches); the plant edit session, when the plant document is the active document and a scene is being edited (SCN-010); the
 * focused code editor; the active visual editor; and the code editor that is shown. The code editor's module is loaded when it is
 * asked for: a code editor that has the focus has loaded it already.
 */
const history =
  (direction: 'undo' | 'redo'): CommandHandler =>
  async () => {
    if (isPlainField(document.activeElement)) {
      document.execCommand(direction);
      return;
    }
    const session = usePlantEdit.getState();
    if (usePlantDocument.getState().active && session.editor) {
      if (session.running)
        announce(t('plantEditor.running')); // SCN-008: nothing is edited while the plant runs
      else session[direction]();
      return;
    }
    const { monacoEditor } = await import('../../components/monacoRuntime');
    const editors = monacoEditor.getEditors();
    const focused = editors.find((editor) => editor.hasTextFocus());
    if (focused) return void focused.trigger('edit.menu', direction, null);
    if (visualHistory?.(direction)) return;
    editors[0]?.trigger('edit.menu', direction, null);
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
