/** Commands of the change review (SHL-004): `view.changes` opens the review document in the editor area. */
import { useEffect } from 'react';
import { REVIEW_VIEW_ID, useReviewDocument } from '../../store/useReviewDocument';
import { bindCommands } from '../bus';
import { focusSoon } from './layout';

export function useReviewCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'view.changes': () => {
          useReviewDocument.getState().show();
          focusSoon(`[id="editor-tab-${REVIEW_VIEW_ID}"]`);
        },
      }),
    [],
  );
}
