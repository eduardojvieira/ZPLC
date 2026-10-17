/**
 * The body of the dialog that confirms a deploy to a real device (UX-019). It compares the project with the device row by row,
 * highlights what does not match by words and icon and not by hue alone, says what the outputs do during the transfer
 * (RT-023), names its action by the effect ("Stop PLC and deploy") and starts with focus on Cancel (the kit's
 * `AlertDialog`, see deployConfirm.tsx). It is the only way to a deploy: the toolbar, the menu, the palette and the
 * keyboard all end there.
 */
import { AlertTriangle, Check, Minus, type LucideIcon } from 'lucide-react';
import { useT } from '../i18n';
import { ICON_SIZES } from '../theme/tokens';
import type { DeployComparison, DeployRowStatus } from './deployComparison';

const STATUS: Record<DeployRowStatus, { icon: LucideIcon; text: 'deploy.status.match' | 'deploy.status.mismatch' | 'deploy.status.unreported' | 'deploy.status.info'; tone: string }> = {
  match: { icon: Check, text: 'deploy.status.match', tone: 'text-[var(--tone-success-fg)]' },
  mismatch: { icon: AlertTriangle, text: 'deploy.status.mismatch', tone: 'font-semibold text-[var(--tone-danger-fg)]' },
  unreported: { icon: Minus, text: 'deploy.status.unreported', tone: 'text-[var(--text-secondary)]' },
  info: { icon: Minus, text: 'deploy.status.info', tone: 'text-[var(--text-secondary)]' },
};

export function DeployDialogBody({ comparison, refusal = null }: { comparison: DeployComparison; refusal?: string | null }) {
  const { t: tr } = useT();
  const problems = comparison.rows.filter((row) => row.message !== null);
  const cell = 'border-b border-[var(--color-surface-700)] px-2 py-1.5 align-top';
  return (
    <div className="space-y-3 text-sm text-[var(--text-primary)]" data-deploy-dialog>
      {refusal !== null && <p role="alert" className="font-semibold text-[var(--tone-danger-fg)]">{refusal}</p>}
      <table className="w-full border-collapse text-left text-xs">
        <caption className="ui-visually-hidden">{tr('deploy.table.caption')}</caption>
        <thead>
          <tr className="text-[var(--text-secondary)]">
            <th scope="col" className={cell}>{tr('deploy.col.item')}</th>
            <th scope="col" className={cell}>{tr('deploy.col.project')}</th>
            <th scope="col" className={cell}>{tr('deploy.col.device')}</th>
            <th scope="col" className={cell}>{tr('deploy.col.check')}</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => {
            const status = STATUS[row.status];
            const Icon = status.icon;
            return (
              <tr key={row.id} data-row={row.id} data-status={row.status} className={row.status === 'mismatch' ? 'bg-[var(--tone-danger-bg)]' : undefined}>
                <th scope="row" className={`${cell} font-medium`}>{row.label}</th>
                <td className={`${cell} break-all`}>{row.project}</td>
                <td className={`${cell} break-all`}>{row.device}</td>
                <td className={`${cell} whitespace-nowrap ${status.tone}`}>
                  <span className="inline-flex items-center gap-1">
                    <Icon size={ICON_SIZES.sm} aria-hidden="true" />
                    <span>{tr(status.text)}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(problems.length > 0 || comparison.notes.length > 0) && (
        <ul className="space-y-1 text-[var(--tone-danger-fg)]" data-deploy-problems>
          {problems.map((row) => (
            <li key={row.id} className="flex items-start gap-1.5">
              <AlertTriangle size={ICON_SIZES.sm} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span><strong>{row.label}.</strong> {row.message}</span>
            </li>
          ))}
          {comparison.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
      <p data-deploy-safe-state>{comparison.safeState} <span className="text-[var(--text-secondary)]">{comparison.scope}</span></p>
      <p className="text-[var(--text-secondary)]">{comparison.transfer}</p>
    </div>
  );
}
