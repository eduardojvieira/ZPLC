/**
 * Asks what to do with a modified file that changed on disk outside Studio (IDE-004): keep the user's version, or load
 * the one on disk. Nothing is overwritten without the user's choice; Escape keeps every version as it is.
 */
import { useT } from '../i18n';
import { Button } from '../ui';
import { Modal } from './Modal';
import { resolveConflict, useExternalConflicts } from '../store/externalChangeWatch';

export function ExternalChangePrompt() {
  const { t } = useT();
  const conflicts = useExternalConflicts((state) => state.conflicts);
  if (conflicts.length === 0) return null;
  return (
    <Modal isOpen onClose={() => conflicts.forEach((conflict) => resolveConflict(conflict.path, 'mine'))} title={t('externalChange.title')} widthClass="max-w-lg" showCloseButton={false}>
      <div className="p-4" data-external-change-prompt>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">{t('externalChange.intro')}</p>
        <ul className="space-y-2">
          {conflicts.map((conflict) => (
            <li key={conflict.path} data-external-change={conflict.path} className="flex items-center justify-between gap-3 rounded border border-[var(--color-surface-600)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-surface-100)]">{conflict.name}</p>
                <p className="truncate text-xs text-[var(--color-surface-400)]">{conflict.disk === null ? t('externalChange.deleted') : t('externalChange.changed')} · {conflict.path}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="primary" aria-label={t('externalChange.keepLabel', { name: conflict.name })} onClick={() => resolveConflict(conflict.path, 'mine')}>{t('externalChange.keep')}</Button>
                <Button aria-label={conflict.disk === null ? t('externalChange.closeLabel', { name: conflict.name }) : t('externalChange.loadLabel', { name: conflict.name })} onClick={() => resolveConflict(conflict.path, 'disk')}>
                  {conflict.disk === null ? t('externalChange.close') : t('externalChange.load')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
