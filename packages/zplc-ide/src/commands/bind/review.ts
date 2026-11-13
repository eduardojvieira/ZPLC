/** Commands of the change review (plan-u2.md: H1 changes `view.changes` to open the review document). */
import { useEffect } from 'react';
import { bindCommands } from '../bus';
import { showPanel } from './layout';

export function useReviewCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'view.changes': showPanel('changes'),
      }),
    [],
  );
}
