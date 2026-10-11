/**
 * The firmware image of the selected board (REL-025): the file, its checksum, where it is and the steps to flash it.
 * It lists and explains. It has no button that writes to a board: a person flashes (AGENTS.md rule 7).
 */
import { useEffect, useState } from 'react';
import { parseFirmwareImagesResult, type FirmwareImagesResult } from '../../../electron/firmwareImagesProtocol';
import { presentFirmwareImage, type FirmwareImagePresentation } from '../../boards/firmwareImage';
import { ZPLC_REPO_VERSION } from '../../version';

const SECTION = 'rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)]/60 px-3 py-3 text-xs leading-5 text-[var(--color-surface-300)]';

function kibibytes(bytes: number): string {
  return `${new Intl.NumberFormat().format(bytes)} bytes`;
}

/** The card for a presentation; the container below supplies it, a test supplies it directly. */
export function FirmwareImageView({ presentation }: { presentation: FirmwareImagePresentation }) {
  if (presentation.kind === 'no-board') return null;
  if (presentation.kind === 'unavailable' || presentation.kind === 'no-image') {
    return (
      <section className={SECTION} aria-label="Firmware image" data-firmware-image="unavailable">
        <h3 className="text-xs font-medium text-[var(--color-surface-100)]">Firmware image</h3>
        <p className="mt-1">{presentation.message}</p>
      </section>
    );
  }
  return (
    <section className={SECTION} aria-label="Firmware image" data-firmware-image="ready" data-board={presentation.board}>
      <h3 className="text-xs font-medium text-[var(--color-surface-100)]">
        Firmware image: {presentation.displayName}{presentation.learner ? ' (learner board, available offline)' : ''}
      </h3>
      <p className="mt-1">Release {presentation.version}, built from commit <span className="font-mono">{presentation.commit.slice(0, 12)}</span>.</p>
      {presentation.versionNote ? <p className="mt-1 text-[var(--color-accent-yellow)]" role="note">{presentation.versionNote}</p> : null}
      <p className="mt-1" data-evidence={presentation.evidenceLevel}>{presentation.evidence}</p>
      <dl className="mt-2 space-y-1">
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">File: </dt><dd className="inline font-mono break-all">{presentation.image.file}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">SHA-256: </dt><dd className="inline font-mono break-all tabular-nums">{presentation.image.sha256}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">Size: </dt><dd className="inline tabular-nums">{kibibytes(presentation.image.bytes)}</dd></div>
        <div><dt className="inline font-medium text-[var(--color-surface-100)]">Where it is: </dt><dd className="inline break-all">{presentation.image.location}</dd></div>
        {presentation.debug ? (
          <div><dt className="inline font-medium text-[var(--color-surface-100)]">Debug file (ELF, for a debugger): </dt><dd className="inline font-mono break-all">{presentation.debug.file}</dd> <span className="font-mono break-all">{presentation.debug.sha256}</span></div>
        ) : null}
      </dl>
      <h4 className="mt-3 text-xs font-medium text-[var(--color-surface-100)]">Flashing steps</h4>
      <ol className="mt-1 list-decimal space-y-1 pl-5" aria-label="Flashing steps">
        {presentation.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="mt-2 font-medium text-[var(--color-surface-100)]" role="note">{presentation.notice}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-[var(--color-surface-100)]">Images of release {presentation.version}</summary>
        <ul className="mt-1 space-y-0.5" aria-label="Firmware images of the release">
          {presentation.boards.map((entry) => (
            <li key={entry.board} data-board={entry.board}>
              <span className="text-[var(--color-surface-100)]">{entry.displayName}</span>{entry.learner ? ' (learner board)' : ''}: <span className="font-mono break-all">{entry.file}</span>, {entry.offline ? 'inside this installation' : 'download it from the release'}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Asks the main process for the images of this installation once, and shows the one of the board. */
export function FirmwareImageCard({ ideId }: { ideId: string | undefined }) {
  const [result, setResult] = useState<FirmwareImagesResult | null | undefined>(undefined);
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.firmwareImages;

  useEffect(() => {
    if (!bridge) { setResult(null); return undefined; }
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
