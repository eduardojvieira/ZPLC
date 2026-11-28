/**
 * Position, rotation, name and settings of one part, all as labelled fields (SCN-009, SCN-014). Props only; the host decides where it sits.
 */
import { useState } from 'react';
import { useT } from '../../i18n';
import { Checkbox, NumberField, Select, TextField } from '../../ui';
import type { ConfigField, PartDefinition, ScenePart } from '../contracts';
import type { ProblemAt } from './validate';

export interface PartFormProps {
  part: ScenePart | null;
  def: PartDefinition | undefined;
  problems: readonly ProblemAt[];
  disabled: boolean;
  /** Prefixes the ids of the form, so two forms of the scene can be mounted at once; the default keeps today's ids. */
  idPrefix?: string;
  onMove(x: number, z: number): void;
  onRotate(deg: number): void;
  onConfigure(patch: { name?: string; config?: Record<string, number | string | boolean> }): void;
}

/** A number or text edited in place: it is applied on Enter or when the field loses focus, so typing never half-applies. */
function Draft(props: {
  label: string;
  value: number | string;
  numeric: boolean;
  disabled: boolean;
  min?: number;
  max?: number;
  error?: string;
  onCommit(value: string): void;
}) {
  const { label, value, numeric, disabled, min, max, error, onCommit } = props;
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = () => {
    if (text.trim() !== '' && text !== String(value)) onCommit(text);
  };
  const common = {
    label,
    value: text,
    disabled,
    error,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e: { key: string }) => e.key === 'Enter' && commit(),
  };
  return numeric ? <NumberField {...common} step="any" min={min} max={max} /> : <TextField {...common} />;
}

function ConfigControl(props: {
  name: string;
  field: ConfigField;
  value: number | string | boolean;
  disabled: boolean;
  error?: string;
  onChange(value: number | string | boolean): void;
}) {
  const { name, field, value, disabled, error, onChange } = props;
  const label = field.unit ? `${name} (${field.unit})` : name;
  if (field.kind === 'boolean') {
    return <Checkbox label={label} checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.kind === 'enum') {
    return (
      <Select label={label} value={String(value)} disabled={disabled} error={error} onChange={(e) => onChange(e.target.value)}>
        {(field.values ?? []).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <Draft
      label={label}
      value={Number(value)}
      numeric
      disabled={disabled}
      min={field.min}
      max={field.max}
      error={error}
      onCommit={(v) => onChange(Number(v))}
    />
  );
}

export function PartForm({ part, def, problems, disabled, idPrefix = '', onMove, onRotate, onConfigure }: PartFormProps) {
  const { t } = useT();
  if (!part) return <p>{t('plantEditor.noSelection')}</p>;
  const at = (suffix: string) => problems.find((p) => p.partId === part.id && p.path.endsWith(suffix))?.message;
  return (
    <section aria-labelledby={`${idPrefix}plant-editor-form`} className="flex flex-col gap-2">
      <h3 id={`${idPrefix}plant-editor-form`}>{t('plantEditor.formHeading')}</h3>
      <Draft
        label={t('plantEditor.name')}
        value={part.name}
        numeric={false}
        disabled={disabled}
        error={at('.name')}
        onCommit={(v) => onConfigure({ name: v })}
      />
      <Draft
        label={t('plantEditor.posX')}
        value={part.position[0]}
        numeric
        disabled={disabled}
        onCommit={(v) => onMove(Number(v), part.position[2])}
      />
      <Draft
        label={t('plantEditor.posZ')}
        value={part.position[2]}
        numeric
        disabled={disabled}
        onCommit={(v) => onMove(part.position[0], Number(v))}
      />
      <Draft
        label={t('plantEditor.rotation')}
        value={part.rotationYDeg}
        numeric
        disabled={disabled}
        onCommit={(v) => onRotate(Number(v))}
      />
      {Object.entries(def?.config ?? {}).map(([key, field]) => (
        <ConfigControl
          key={key}
          name={key}
          field={field}
          value={part.config[key] ?? field.default}
          disabled={disabled}
          error={at(`.config.${key}`)}
          onChange={(value) => onConfigure({ config: { [key]: value } })}
        />
      ))}
    </section>
  );
}
