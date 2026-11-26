/**
 * Asks what to do with a modified file that changed on disk outside Studio (IDE-004): keep the user's version, or load
 * the one on disk, after comparing them if the user wants. Nothing is overwritten without the user's choice; Escape keeps
 * every version as it is.
 *
 * It also holds the notices of the files replaced from outside (AIX-012): each names its file and, when Studio knew what
 * the file held, offers what changed (shown here, as a difference) and the restore of that version. The notices are
 * announced when they arrive (`externalChangeWatch.ts`) and stay until dismissed.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';
import { changedHunks, diffLines } from '../project/migrationDiff';
import { Button, IconButton } from '../ui';
import { Modal } from './Modal';
import {
  closeReview,
  dismissNotice,
  resolveConflict,
  restoreExternal,
  showChanges,
  useExternalConflicts,
  type ExternalNotice,
} from '../store/externalChangeWatch';
import { useIDEStore } from '../store/useIDEStore';

const SIGN = { same: ' ', removed: '-', added: '+' } as const;
const TONE = {
  same: 'text-[var(--color-surface-300)]',
  removed: 'bg-[color-mix(in_srgb,var(--color-accent-red)_18%,transparent)] text-[var(--color-surface-100)]',
  added: 'bg-[color-mix(in_srgb,var(--color-accent-green)_18%,transparent)] text-[var(--color-surface-100)]',
} as const;

/** The changed lines of `after` against `before`, with two lines of context, signed so that they read without colour. */
function Difference({ name, before, after }: { name: string; before: string; after: string }) {
  const { t } = useT();
  const hunks = changedHunks(diffLines(before, after));
  return (
    <div
      role="group"
      aria-label={t('studio.notice.whatChangedLabel', { name })}
      tabIndex={0}
      data-external-difference
      className="mt-2 max-h-72 overflow-auto border border-[var(--color-surface-600)] bg-[var(--color-surface-900)]"
    >
      {hunks.length === 0 && <p className="p-2 text-xs text-[var(--color-surface-300)]">{t('studio.notice.noDifference')}</p>}
      {hunks.map((hunk, index) => (
        <pre key={index} className="border-b border-[var(--color-surface-700)] py-1 font-mono text-xs leading-5 last:border-b-0">
          {hunk.map((line, lineIndex) => (
            <div key={lineIndex} className={`whitespace-pre px-2 ${TONE[line.kind]}`} data-diff-line={line.kind}>
              {`${SIGN[line.kind]} ${line.text}`}
            </div>
          ))}
        </pre>
      ))}
    </div>
  );
}

const NOTICE_TEXT = {
  file: 'studio.notice.externalUpdated',
  plant: 'studio.notice.externalPlant',
  project: 'studio.notice.externalProject',
} as const;

const NOTICE_CLASS =
  'rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2 text-sm ' +
  'text-[var(--color-surface-100)] shadow-lg';

function Notices({ notices }: { notices: ExternalNotice[] }) {
  const { t } = useT();
  if (notices.length === 0) return null;
  return (
    <section
      aria-label={t('studio.notice.externalRegion')}
      data-external-notices
      className="fixed bottom-12 right-4 z-50 flex w-[22.5rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {notices.map((notice) => {
        const shown = notice.before !== undefined && notice.after !== undefined;
        return (
          <div key={notice.path} data-external-notice={notice.path} className={NOTICE_CLASS}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{t(NOTICE_TEXT[notice.kind], { name: notice.name })}</p>
                {notice.name !== notice.path && <p className="mt-0.5 text-xs break-words text-[var(--color-surface-300)]">{notice.path}</p>}
              </div>
              <IconButton
                label={t('studio.notice.dismissLabel', { name: notice.name })}
                variant="ghost"
                size="sm"
                icon={<X size={14} aria-hidden="true" />}
                className="shrink-0"
                onClick={() => dismissNotice(notice.path)}
              />
            </div>
            {shown && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('studio.notice.whatChangedLabel', { name: notice.name })}
                  onClick={() => showChanges(notice.path)}
                >
                  {t('studio.notice.whatChanged')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('studio.notice.restoreLabel', { name: notice.name })}
                  onClick={() => void restoreExternal(notice.path)}
                >
                  {t('studio.notice.restore')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function ExternalChangePrompt() {
  const { t } = useT();
  const conflicts = useExternalConflicts((state) => state.conflicts);
  const notices = useExternalConflicts((state) => state.notices);
  const review = useExternalConflicts((state) => state.review);
  const loadedFiles = useIDEStore((state) => state.loadedFiles);
  const [comparing, setComparing] = useState<string | null>(null);
  const mine = (path: string) => [...loadedFiles.values()].find((file) => file.path === path)?.content;

  if (review) {
    return (
      <>
        <Notices notices={notices} />
        <Modal
          isOpen
          onClose={closeReview}
          title={t('studio.notice.reviewTitle', { name: review.name })}
          widthClass="max-w-lg"
          showCloseButton={false}
        >
          <div className="p-4" data-external-review={review.path}>
            <p className="text-sm text-[var(--color-surface-200)]">{t('studio.notice.reviewIntro')}</p>
            <Difference name={review.name} before={review.before} after={review.after} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="primary" onClick={closeReview}>
                {t('studio.notice.closeReview')}
              </Button>
              <Button aria-label={t('studio.notice.restoreLabel', { name: review.name })} onClick={() => void restoreExternal(review.path)}>
                {t('studio.notice.restore')}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }
  if (conflicts.length === 0) return <Notices notices={notices} />;
  return (
    <>
      <Notices notices={notices} />
      <Modal
        isOpen
        onClose={() => conflicts.forEach((conflict) => resolveConflict(conflict.path, 'mine'))}
        title={t('externalChange.title')}
        widthClass="max-w-lg"
        showCloseButton={false}
      >
        <div className="p-4" data-external-change-prompt>
          <p className="mb-3 text-sm text-[var(--color-surface-200)]">{t('externalChange.intro')}</p>
          <ul className="space-y-2">
            {conflicts.map((conflict) => {
              const buffer = conflict.settings?.mine ?? mine(conflict.path);
              return (
                <li
                  key={conflict.path}
                  data-external-change={conflict.path}
                  className="rounded border border-[var(--color-surface-600)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-surface-100)]">{conflict.name}</p>
                      <p className="truncate text-xs text-[var(--color-surface-400)]">
                        {conflict.disk === null ? t('externalChange.deleted') : t('externalChange.changed')} · {conflict.path}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {conflict.disk !== null && buffer !== undefined && (
                        <Button
                          variant="ghost"
                          aria-label={t('studio.notice.compareLabel', { name: conflict.name })}
                          aria-expanded={comparing === conflict.path}
                          onClick={() => setComparing(comparing === conflict.path ? null : conflict.path)}
                        >
                          {t('studio.notice.compare')}
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        aria-label={t('externalChange.keepLabel', { name: conflict.name })}
                        onClick={() => resolveConflict(conflict.path, 'mine')}
                      >
                        {t('externalChange.keep')}
                      </Button>
                      <Button
                        aria-label={
                          conflict.disk === null
                            ? t('externalChange.closeLabel', { name: conflict.name })
                            : t('externalChange.loadLabel', { name: conflict.name })
                        }
                        onClick={() => resolveConflict(conflict.path, 'disk')}
                      >
                        {conflict.disk === null ? t('externalChange.close') : t('externalChange.load')}
                      </Button>
                    </div>
                  </div>
                  {comparing === conflict.path && conflict.disk !== null && buffer !== undefined && (
                    <>
                      <p className="mt-2 text-xs text-[var(--color-surface-300)]">{t('studio.notice.compareIntro')}</p>
                      <Difference name={conflict.name} before={buffer} after={conflict.disk} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
