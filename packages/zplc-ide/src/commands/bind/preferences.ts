/** Commands of Preferences (SHL-011): `file.preferences` opens the document, with or without a project, at the chosen setting. */
import { useEffect } from 'react';
import { usePreferencesDocument, PREFERENCES_VIEW_ID, MCP_SECTION_ID } from '../../store/usePreferencesDocument';
import { bindCommands } from '../bus';
import { takePreferenceAnchor } from '../preferenceAnchor';
import { focusSoon } from './layout';

export function usePreferencesCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'file.preferences': () => {
          usePreferencesDocument.getState().show(takePreferenceAnchor());
          focusSoon(`[id="editor-tab-${PREFERENCES_VIEW_ID}"]`);
        },
        // the MCP connection panel of Preferences (AIX-007); the document scrolls to it and takes the focus into it
        'ai.connectMcp': () => {
          usePreferencesDocument.getState().show(MCP_SECTION_ID);
          focusSoon(`[id="editor-tab-${PREFERENCES_VIEW_ID}"]`);
        },
      }),
    [],
  );
}
