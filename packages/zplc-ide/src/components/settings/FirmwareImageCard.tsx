/**
 * The firmware image of the selected board (REL-025): the file, its checksum, where it is and the steps to flash it.
 * It lists and explains. It has no button that writes to a board: a person flashes (AGENTS.md rule 7).
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { parseFirmwareImagesResult, type FirmwareImagesResult } from '../../../electron/firmwareImagesProtocol';
import { presentFirmwareImage, type FirmwareImagePresentation } from '../../boards/firmwareImage';
import { ZPLC_REPO_VERSION } from '../../version';

const SECTION = 'rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)]/60 px-3 py-3 text-xs leading-5 text-[var(--color-surface-300)]';

function kibibytes(bytes: number, unit: string): string {
  return `${new Intl.NumberFormat().format(bytes)} ${unit}`;
}

/** The card for a presentation; the container below supplies it, a test supplies it directly. */
export function FirmwareImageView({ presentation }: { presentation: FirmwareImagePresentation }) {
  const { t } = useT();
  if (presentation.kind === 'no-board') return null;
  if (presentation.kind === 'unavailable' || presentation.kind === 'no-image') {
    return (
      <section className={SECTION} aria-label={t('settings.firmware.title')} data-firmware-image="unavailable">
        <h3 className="text-xs font-medium text-[var(--color-surface-100)]">{t('settings.firmware.title')}</h3>
        <p className="mt-1">{presentation.message}</p>
      </section>
    );
  }
  return (
    <section className={SECTION} aria-label={t('settings.firmware.title')} data-firmware-image="ready" data-board={presentation.board}>
      <h3 className="text-xs font-medium text-[var(--color-surface-100)]">
        {t('settings.firmware.heading', { name: presentation.displayName })}{presentation.learner ? ` ${t('settings.firmware.learnerOffline')}` : ''}
      </h3>
      <p className="mt-1">{t('settings.firmware.release', { version: presentation.version })} <span className="font-mono">{presentation.commit.slice(0, 12)}</span>.</p>
      {presentation.versionNote ? <p className="mt-1 text-[var(--color-accent-yellow)]" role="note">{presentation.versionNote}</p> : null}
      <p className="mt-1" data-evidence={presentation.evidenceLevel}>{presentation.evidence}</p>
      <dl className="mt-2 space-y-1">
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">{t('settings.firmware.file')} </dt><dd className="inline font-mono break-all">{presentation.image.file}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">{t('settings.firmware.sha')} </dt><dd className="inline font-mono break-all tabular-nums">{presentation.image.sha256}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">{t('settings.firmware.size')} </dt><dd className="inline tabular-nums">{kibibytes(presentation.image.bytes, t('settings.firmware.bytes'))}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">{t('settings.firmware.location')} </dt><dd className="inline break-all">{presentation.image.location}</dd></div>
        {presentation.debug ? (
          <div><dt className="inline font-medium text-[var(--color-surface-100)]">{t('settings.firmware.debug')} </dt><dd className="inline font-mono break-all">{presentation.debug.file}</dd> <span className="font-mono break-all">{presentation.debug.sha256}</span></div>
        ) : null}
      </dl>
      <h4 className="mt-3 text-xs font-medium text-[var(--color-surface-100)]">{t('settings.firmware.steps')}</h4>
      <ol className="mt-1 list-decimal space-y-1 pl-5" aria-label={t('settings.firmware.steps')}>
        {presentation.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="mt-2 font-medium text-[var(--color-surface-100)]" role="note">{presentation.notice}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-[var(--color-surface-100)]">{t('settings.firmware.images', { version: presentation.version })}</summary>
        <ul className="mt-1 space-y-0.5" aria-label={t('settings.firmware.imagesLabel')}>
          {presentation.boards.map((entry) => (
            <li key={entry.board} data-board={entry.board}>
              <span className="text-[var(--color-surface-100)]">{entry.displayName}</span>{entry.learner ? ` ${t('settings.firmware.learner')}` : ''}: <span className="font-mono break-all">{entry.file}</span>, {entry.offline ? t('settings.firmware.offline') : t('settings.firmware.download')}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Asks the main process for the images of this installation once, and shows the one of the board. */
export function FirmwareImageCard({ ideId }: { ideId: string | undefined }) {
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.firmwareImages;
  // no bridge (a browser build) is an answer of its own: the card says so instead of waiting for one
  const [result, setResult] = useState<FirmwareImagesResult | null | undefined>(bridge ? undefined : null);

  useEffect(() => {
    if (!bridge) return undefined;
    let current = true;
    bridge.list().then(
      (answer) => { if (current) setResult(parseFirmwareImagesResult(answer)); },
      () => { if (current) setResult(null); },
    );
    return () => { current = false; };
  }, [bridge]);

  if (result === undefined) return null;
  const platform = typeof window === 'undefined' ? 'linux' : window.electronAPI?.platform ?? 'linux';
  return <FirmwareImageView presentation={presentFirmwareImage(result, ideId, { version: ZPLC_REPO_VERSION, platform })} />;
}
