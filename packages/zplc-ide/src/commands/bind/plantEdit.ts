import { useEffect } from 'react';
import { bindCommands, getCommandState, runCommand } from '../bus';
import type { CommandHandler } from '../bus';
import { t } from '../../i18n';
import { usePlantEdit } from '../../plant/editSession';
import { requestFeedBoard } from '../../store/ioModeStatus';
import { useIDEStore } from '../../store/useIDEStore';
import { usePlantDocument } from '../../store/usePlantDocument';
import { projectPathFromModelPath } from '../../utils/sessionState';
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

const TEXT_ENTRY = new Set(['', 'text', 'search', 'email', 'number', 'password', 'tel', 'url']);

/** A field with a history of its own: a text-entry input or a text area that is not the hidden text area of a code editor. */
const isPlainField = (element: Element | null): boolean =>
  (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TEXT_ENTRY.has(element.type))) &&
  !element.closest('.monaco-editor');

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
    // the editor that shows the active file; with none, nothing is undone that the person did not have in view
    const path = useIDEStore.getState().getActiveFile()?.path;
    const shown = editors.find((editor) => {
      const model = editor.getModel();
      return path !== undefined && model !== null && projectPathFromModelPath(model.uri.path) === path;
    });
    shown?.trigger('edit.menu', direction, null);
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

/** Whether a key was pressed where the plant edit may take it: not in a text field, a menu, or a code editor. */
const keyBelongsToPlant = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return true;
  if (target.closest('.monaco-editor, select, [contenteditable=""], [contenteditable="true"]')) return false;
  return !(target instanceof HTMLInputElement ? TEXT_ENTRY.has(target.type) : target instanceof HTMLTextAreaElement);
};

/**
 * Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (Cmd on macOS, without Y) while the plant edit is on screen: the menu shows these keys but does not
 * register them on Windows and Linux, and a registry shortcut would also undo in the visual editors, which handle the key themselves.
 */
function undoKeys(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
  const key = event.key.toLowerCase();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const command = key === 'z' ? (event.shiftKey ? 'edit.redo' : 'edit.undo') : key === 'y' && !mac && !event.shiftKey ? 'edit.redo' : null;
  if (!command || !usePlantDocument.getState().active || !usePlantEdit.getState().editor || !keyBelongsToPlant(event.target)) return;
  event.preventDefault();
  runCommand(command);
}

export function usePlantEditCommands(): void {
  useEffect(() => {
    window.addEventListener('keydown', undoKeys);
    const unbind = bindCommands(plantEditHandlers());
    return () => {
      window.removeEventListener('keydown', undoKeys);
      unbind();
    };
  }, []);
}
