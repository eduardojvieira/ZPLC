/**
 * Commands of the Assistant view and the Inspector (SHL-008): they show a view of the secondary sidebar, or of the primary one in the
 * compact shell.
 */
import { useEffect } from 'react';
import { useAssistantProvider, useSecondaryView, type SecondaryView } from '../../shell/useSelection';
import { shellDensity } from '../../shell/shellDensity';
import { useShellLayout } from '../../store/useShellLayout';
import { usePreferencesDocument } from '../../store/usePreferencesDocument';
import { bindCommands } from '../bus';
import { focusSoon } from './layout';

/** Shows a view of the secondary sidebar; where that sidebar has no room (UX-023) the view takes the place of the primary one. */
function showSecondaryView(view: SecondaryView): void {
  const layout = useShellLayout.getState();
  const compact = shellDensity(window.innerWidth) === 'compact';
  useSecondaryView.getState().show(view);
  useSecondaryView.getState().setInPrimary(compact);
  if (compact) layout.setPrimaryVisible(true);
  else layout.setSecondaryVisible(true);
  focusSoon(`[data-sidebar-kind="${compact ? 'primary' : 'secondary'}"]`);
}

/**
 * `view.agent` shows the Assistant while a provider is configured; without one it opens Preferences at the Assistant section, where
 * the provider is configured (SHL-011). The answer is the last known one, read at once; the status is read again for the next request.
 */
function showAssistant(): void {
  const provider = useAssistantProvider.getState();
  void provider.refresh();
  if (provider.available) showSecondaryView('assistant');
  else usePreferencesDocument.getState().show('assistant');
}

export function useAssistantCommands(): void {
  useEffect(() => {
    // the first reading of the provider decides whether the Assistant is offered
    const timer = window.setTimeout(() => void useAssistantProvider.getState().refresh(), 0);
    const unbind = bindCommands({
      'view.agent': showAssistant,
      'view.showInspector': () => showSecondaryView('inspector'),
    });
    return () => {
      window.clearTimeout(timer);
      unbind();
    };
  }, []);
}
