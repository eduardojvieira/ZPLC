/** Commands of Preferences and Project settings (plan-u2.md: H2 binds `file.preferences`). */
import { useEffect } from 'react';
import { bindCommands } from '../bus';

export function usePreferencesCommands(): void {
  useEffect(() => bindCommands({}), []);
}
