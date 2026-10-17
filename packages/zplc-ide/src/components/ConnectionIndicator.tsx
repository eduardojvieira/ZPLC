/** The persistent indicator of what Studio is attached to (UX-018): a badge with an icon and words, in the tone of its state. */
import { AlertTriangle, Cpu, Globe, LoaderCircle, Monitor, Unplug, type LucideIcon } from 'lucide-react';
import { ICON_SIZES } from '../theme/tokens';
import { Badge, cx } from '../ui';
import type { ConnectionIcon, ConnectionIndicatorView } from './connectionPresentation';

const ICONS: Record<ConnectionIcon, LucideIcon> = { unplug: Unplug, monitor: Monitor, globe: Globe, loader: LoaderCircle, cpu: Cpu, alert: AlertTriangle };

export function ConnectionIndicator({ indicator }: { indicator: ConnectionIndicatorView }) {
  const Icon = ICONS[indicator.icon];
  const hardware = indicator.state.startsWith('hardware');
  return (
    <span role="status" aria-live="polite" aria-atomic="true" data-connection={indicator.state}>
      <Badge tone={indicator.tone} className={cx('gap-1.5', hardware && 'font-semibold')}>
        <Icon size={ICON_SIZES.sm} aria-hidden="true" className={indicator.icon === 'loader' ? 'animate-spin motion-reduce:animate-none' : undefined} />
        <span>{indicator.label}</span>
      </Badge>
    </span>
  );
}
