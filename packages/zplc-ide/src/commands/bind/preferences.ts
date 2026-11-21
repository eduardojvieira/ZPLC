/** Commands of Preferences (SHL-011): `file.preferences` opens the document, with or without a project, at the chosen setting. */
import { useEffect } from 'react';
import { usePreferencesDocument, PREFERENCES_VIEW_ID } from '../../store/usePreferencesDocument';
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
      }),
    [],
  );
}
