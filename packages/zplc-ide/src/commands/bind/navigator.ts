/**
 * Commands that create and change objects from the navigator (plan-u2.md: H4 binds the `project.new*` and item commands,
 * and `file.closeProject`).
 */
import { useEffect } from 'react';
import { bindCommands } from '../bus';

export function useNavigatorCommands(): void {
  useEffect(() => bindCommands({}), []);
}
