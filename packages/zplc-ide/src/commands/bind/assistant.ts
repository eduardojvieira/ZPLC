/** Commands of the Assistant view and the Inspector (plan-u2.md: H3 changes `view.agent` and binds `view.showInspector`). */
import { useEffect } from 'react';
import { bindCommands } from '../bus';
import { showPanel } from './layout';

export function useAssistantCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'view.agent': showPanel('agent'),
      }),
    [],
  );
}
