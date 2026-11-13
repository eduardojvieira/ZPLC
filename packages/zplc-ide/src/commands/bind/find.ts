/** Commands of references and navigation (plan-u2.md: R4 binds go to definition and find all references, P3 back and forward). */
import { useEffect } from 'react';
import { bindCommands } from '../bus';

export function useFindCommands(): void {
  useEffect(() => bindCommands({}), []);
}
