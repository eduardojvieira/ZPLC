/** The signals of the scene with type and direction, and a bind control for each (SCN-011, SCN-012, SCN-014). Props only. */
import { useState } from 'react';
import { useT } from '../../i18n';
import { Button, NumberField, TextField } from '../../ui';
import type { PlantSignalDef } from '../contracts';
import type { SignalRange } from '../../plants/plantMap';
import type { ProblemAt } from './validate';

export interface SignalTableProps {
  signals: readonly PlantSignalDef[];
  /** The program point each bound signal is bound to. */
  bindings: Readonly<Record<string, string>>;
  problems: readonly ProblemAt[];
  disabled: boolean;
  onBind(signal: string, point: string, range?: SignalRange): void;
  onUnbind(signal: string): void;
}

const NO_RANGE = { rawMin: '0', rawMax: '100', engMin: '0', engMax: '100', unit: '' };

function Row(
  props: { signal: PlantSignalDef; point: string | undefined; error?: string; disabled: boolean } & Pick<
    SignalTableProps,
    'onBind' | 'onUnbind'
  >,
) {
  const { signal, point, error, disabled } = props;
  const { t } = useT();
  const [text, setText] = useState(point ?? '');
  const [range, setRange] = useState(NO_RANGE);
  const scaled = signal.type !== 'BOOL';
  const bind = () =>
    props.onBind(
      signal.name,
      text.trim(),
      scaled
        ? {
            raw_min: Number(range.rawMin),
            raw_max: Number(range.rawMax),
            eng_min: Number(range.engMin),
            eng_max: Number(range.engMax),
            unit: range.unit,
          }
        : undefined,
    );
  const num = (key: 'rawMin' | 'rawMax' | 'engMin' | 'engMax', label: Parameters<typeof t>[0]) => (
    <NumberField
      label={t(label, { signal: signal.name })}
      value={range[key]}
      disabled={disabled}
      onChange={(e) => setRange({ ...range, [key]: e.target.value })}
    />
  );
  return (
    <tr data-signal={signal.name}>
      <th scope="row">{signal.name}</th>
      <td>{signal.type}</td>
      <td>{signal.direction === 'command' ? t('plantEditor.dirCommand') : t('plantEditor.dirSensor')}</td>
      <td>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label={t('plantEditor.point', { signal: signal.name })}
            value={text}
            disabled={disabled}
            error={error}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && bind()}
          />
          {scaled && (
            <>
              {num('rawMin', 'plantEditor.rawMin')}
              {num('rawMax', 'plantEditor.rawMax')}
              {num('engMin', 'plantEditor.engMin')}
              {num('engMax', 'plantEditor.engMax')}
              <TextField
                label={t('plantEditor.unit', { signal: signal.name })}
                value={range.unit}
                disabled={disabled}
                onChange={(e) => setRange({ ...range, unit: e.target.value })}
              />
            </>
          )}
          <Button disabled={disabled} onClick={bind}>
            {t('plantEditor.bind', { signal: signal.name })}
          </Button>
          {point !== undefined && (
            <Button
              disabled={disabled}
              onClick={() => {
                props.onUnbind(signal.name);
                setText('');
              }}
            >
              {t('plantEditor.unbind', { signal: signal.name })}
            </Button>
          )}
        </div>
        <p>{point === undefined ? t('plantEditor.unbound') : t('plantEditor.bound', { point })}</p>
      </td>
    </tr>
  );
}

export function SignalTable({ signals, bindings, problems, disabled, onBind, onUnbind }: SignalTableProps) {
  const { t } = useT();
  return (
    <section aria-labelledby="plant-editor-signals" className="flex flex-col gap-2">
      <h3 id="plant-editor-signals">{t('plantEditor.signalsHeading')}</h3>
      {signals.length === 0 ? (
        <p>{t('plantEditor.noSignals')}</p>
      ) : (
        <table aria-label={t('plantEditor.signalsLabel')}>
          <thead>
            <tr>
              <th scope="col">{t('plantEditor.colSignal')}</th>
              <th scope="col">{t('plantEditor.colType')}</th>
              <th scope="col">{t('plantEditor.colDirection')}</th>
              <th scope="col">{t('plantEditor.colPoint')}</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => (
              <Row
                key={`${s.name}#${i}`}
                signal={s}
                point={bindings[s.name]}
                error={problems.find((p) => p.path === `signals.${s.name}`)?.message}
                disabled={disabled}
                onBind={onBind}
                onUnbind={onUnbind}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
