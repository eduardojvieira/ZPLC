/**
 * What the status rail keeps off its one line (FLW-011): runtime, cycles, tasks, firmware, protocol. A kit popover opened by a button or by
 * `view.statusDetails`.
 */
import { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import { useT } from '../i18n';
import { bindCommands } from '../commands/bus';
import { Button, Popover } from '../ui';

export interface StatusDetailRow {
  label: string;
  value: string;
  numeric?: boolean;
}

export function StatusDetails({ rows }: { rows: StatusDetailRow[] }) {
  const { t } = useT();
  const trigger = useRef<HTMLButtonElement>(null);
  // the command opens the popover through its own trigger, so focus and Escape behave as for a press
  useEffect(() => bindCommands({ 'view.statusDetails': () => trigger.current?.click() }), []);
  return (
    <Popover
      label={t('studio.status.detailsLabel')}
      placement="bottom-end"
      trigger={
        <Button ref={trigger} data-command="view.statusDetails" variant="ghost" size="sm" icon={<Info size={14} aria-hidden="true" />}>
          {t('studio.status.details')}
        </Button>
      }
    >
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-[var(--text-muted)]">{row.label}</dt>
            <dd className={row.numeric ? 'font-mono tabular-nums' : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Popover>
  );
}
