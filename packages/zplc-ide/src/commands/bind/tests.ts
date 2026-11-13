/**
 * Commands of the Tests activity and the test runner (plan-u2.md: T2 changes `view.tests`, T3 binds `view.testResults`,
 * T4 the `build.*` test commands).
 */
import { useEffect } from 'react';
import { bindCommands } from '../bus';
import { showActivity, showPanel } from './layout';

export function useTestCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'view.tests': () => {
          showActivity('tests');
          showPanel('tests')();
        },
        'view.interlocks': showPanel('interlocks'),
      }),
    [],
  );
}
