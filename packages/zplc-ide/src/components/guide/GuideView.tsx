/** The Guide: the lesson of an open lesson workspace, in the secondary sidebar on every activity (GDE-001). */
import { useWorkspaceTestResult } from '../../shell/workspaceTestResult';
import { Guide } from './Guide';

export function GuideView() {
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  return <Guide workspaceTestPresentation={presentation} />;
}
