/**
 * The Guide: the lesson of an open lesson workspace, in the secondary sidebar on every activity (GDE-001). This unit only moves the
 * lesson panel here; the Guide's own steps and checks are task G1.
 */
import { LearnPanel } from '../LearnPanel';
import { useWorkspaceTestResult } from '../../shell/workspaceTestResult';

export function GuideView() {
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  return <LearnPanel workspaceTestPresentation={presentation} />;
}
