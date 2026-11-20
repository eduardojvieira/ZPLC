/**
 * The boundary of a result, stated once (MSG-003): "Simulation result" (or "Board result"), with the full claim in a tooltip. The
 * tooltip repeats what 2.0 claimed, no more: not evidence of a physical lamp, hardware timing, HIL, or certification (P6).
 */
import { Badge, Tooltip } from '../ui';
import { useT } from '../i18n';

export type ResultBoundary = 'simulation' | 'board';

export function BoundaryBadge({ boundary }: { boundary: ResultBoundary }) {
  const { t } = useT();
  return (
    <Tooltip content={t(boundary === 'board' ? 'u2Tests.boundary.boardClaim' : 'u2Tests.boundary.simulationClaim')}>
      <span tabIndex={0} data-boundary-badge={boundary}>
        <Badge tone="neutral">{t(boundary === 'board' ? 'u2Tests.boundary.board' : 'u2Tests.boundary.simulation')}</Badge>
      </span>
    </Tooltip>
  );
}
