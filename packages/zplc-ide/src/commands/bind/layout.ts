/**
 * Commands of the layout (plan-u2.md, Task H5 binds `view.resetLayout` here), and the two helpers every view command shares:
 * a command that shows a surface also takes the keyboard there (UX-025). The helpers live in this leaf module so that the
 * other binding files and `useCommandHost.ts` can import them without a cycle.
 */
import { useEffect } from 'react';
import { useIDEStore } from '../../store/useIDEStore';
import { t } from '../../i18n';
import { useNotifications } from '../../store/notifications';
import { resetLayout, useShellLayout } from '../../store/useShellLayout';
import type { ConsoleTab } from '../../types';
import { bindCommands } from '../bus';

/** Takes the focus to a control once the palette has given its own back. */
export const focusSoon = (selector: string): void => {
  window.setTimeout(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus()), 0);
};

export const showPanel = (tab: ConsoleTab) => (): void => {
  const state = useIDEStore.getState();
  if (state.isConsoleCollapsed) state.toggleConsole();
  state.setActiveConsoleTab(tab);
  focusSoon(`#console-tab-${tab}`);
};

export const showActivity = (view: 'project' | 'search' | 'learn' | 'tests'): void => {
  useShellLayout.getState().showActivity(view);
  focusSoon(`[data-activity="${view}"]`);
};

export function useLayoutCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'view.resetLayout': () => {
          resetLayout();
          useNotifications.getState().report({ kind: 'save', status: 'success', title: t('layout.reset.done'), details: 'output' });
          focusSoon('main');
        },
      }),
    [],
  );
}
