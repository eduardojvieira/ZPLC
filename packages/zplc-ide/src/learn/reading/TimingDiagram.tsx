/**
 * A timing diagram (LRN-041): the signals of a `timing` block, or of a live run, drawn as SVG, with the same facts as a
 * table for those who do not read the drawing. A signal starts FALSE and toggles at each edge.
 */
import { useId } from 'react';
import { useT } from '../../i18n';
import type { TimingData } from '../readingTypes';
import { LABEL_W, PAD, PLOT_W, ROW_H, TOP, level, timingRows, wavePath } from './timingGeometry';

export function TimingDiagram({ data }: { data: TimingData }) {
  const { t } = useT();
  const titleId = useId();
  const title = data.caption ?? t('learnReading.timing.defaultTitle');
  const height = TOP + data.signals.length * ROW_H + PAD;
  const x = (time: number): number => LABEL_W + (Math.min(Math.max(time, 0), data.span) / data.span) * PLOT_W;
  const value = (on: boolean): string => t(on ? 'learnReading.value.true' : 'learnReading.value.false');
  return (
    <figure data-reading-block="timing" aria-label={t('learnReading.timing.label', { title })} className="my-4">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${LABEL_W + PLOT_W + PAD} ${height}`}
        className="h-auto w-full text-[var(--text-primary)]"
      >
        <title id={titleId}>{t('learnReading.timing.label', { title })}</title>
        {data.signals.map((signal, row) => (
          <g key={signal.name}>
            <text x={0} y={level(row, false)} fill="currentColor" fontSize={12}>
              {signal.name}
            </text>
            <path d={wavePath(signal.edges, data.span, row)} fill="none" stroke="currentColor" strokeWidth={2} />
          </g>
        ))}
        {(data.marks ?? []).map((mark, index) => (
          <g key={`${mark.label}-${index}`} data-timing-mark={mark.label}>
            <title>{t('learnReading.timing.markLabel', { label: mark.label, from: mark.from, to: mark.to })}</title>
            <path
              d={`M ${x(mark.from)} ${TOP - 6} V ${TOP - 12} H ${x(mark.to)} V ${TOP - 6}`}
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth={1.5}
            />
            <text x={(x(mark.from) + x(mark.to)) / 2} y={TOP - 15} textAnchor="middle" fill="var(--text-secondary)" fontSize={11}>
              {mark.label}
            </text>
          </g>
        ))}
      </svg>
      <details className="mt-1 text-sm text-[var(--text-secondary)]">
        <summary className="cursor-pointer">{t('learnReading.timing.tableSummary')}</summary>
        <p className="mt-1">{t('learnReading.timing.tableIntro')}</p>
        <table className="mt-1 w-full border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="border-b border-[var(--border-color)] py-1 pr-3">
                {t('learnReading.timing.colSignal')}
              </th>
              <th scope="col" className="border-b border-[var(--border-color)] py-1 pr-3">
                {t('learnReading.timing.colTime')}
              </th>
              <th scope="col" className="border-b border-[var(--border-color)] py-1">
                {t('learnReading.timing.colValue')}
              </th>
            </tr>
          </thead>
          <tbody>
            {timingRows(data).map((row, index) => (
              <tr key={index}>
                <td className="py-0.5 pr-3">{row.signal}</td>
                <td className="py-0.5 pr-3 tabular-nums">{row.time}</td>
                <td className="py-0.5">{value(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {data.caption && <figcaption className="mt-1 text-sm text-[var(--text-secondary)]">{data.caption}</figcaption>}
    </figure>
  );
}
