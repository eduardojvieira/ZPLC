/** The commands of milestone U2, bound by the code that owns each behaviour (plan-u2.md, Task X0b); mounted once by `useShellCommands`. */
import { useAssistantCommands } from './assistant';
import { useFindCommands } from './find';
import { useLayoutCommands } from './layout';
import { useNavigatorCommands } from './navigator';
import { usePreferencesCommands } from './preferences';
import { useReviewCommands } from './review';
import { useTestCommands } from './tests';

export function useU2Commands(): void {
  useTestCommands();
  useFindCommands();
  useReviewCommands();
  useAssistantCommands();
  useNavigatorCommands();
  useLayoutCommands();
  usePreferencesCommands();
}
