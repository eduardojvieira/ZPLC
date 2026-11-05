/**
 * The Ladder rungs of a lesson file, drawn read-only (LRN-041). `LdFigure` is the `ld-figure` block; `LdRungs` is also what
 * the try-it lab draws its live power flow with.
 */
import LDRungGrid from '../../editors/ld/LDRungGrid';
import { useT } from '../../i18n';
import type { ElementState } from '../../monitoring/elementStates';
import type { LdFigureData } from '../readingTypes';
import { useLdRungs, type LoadedRungs } from './useLdRungs';

export function LdRungs({ loaded, states }: { loaded: Extract<LoadedRungs, { ok: true }>; states?: ReadonlyMap<string, ElementState> }) {
  return (
    <div className="space-y-2 overflow-x-auto">
      {loaded.rungs.map((rung) => (
        <LDRungGrid key={rung.id} rung={rung} readOnly elementStates={states} />
      ))}
    </div>
  );
}

export function LdFigure({ data, files }: { data: LdFigureData; files: Record<string, string> }) {
  const { t } = useT();
  const loaded = useLdRungs(files, data.src, data.rung);
  if (!loaded.ok) {
    const text = t(`learnReading.figure.${loaded.reason}` as const, { detail: loaded.detail });
    return (
      <p role="alert" data-reading-block="ld-figure" className="my-4 text-sm text-[var(--tone-danger-fg)]">
        {text}
      </p>
    );
  }
  return (
    <figure
      data-reading-block="ld-figure"
      aria-label={t('learnReading.figure.label', { title: data.caption ?? loaded.name })}
      className="my-4"
    >
      <LdRungs loaded={loaded} />
      {data.caption && <figcaption className="mt-1 text-sm text-[var(--text-secondary)]">{data.caption}</figcaption>}
    </figure>
  );
}
