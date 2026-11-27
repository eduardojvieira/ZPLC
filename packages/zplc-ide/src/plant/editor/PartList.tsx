/**
 * The catalogue list and the parts of the scene (SCN-008, SCN-014, SCN-015). Data and callbacks by props: it does not know where it is
 * mounted.
 */
import { useState } from 'react';
import { translatorFor, useT } from '../../i18n';
import { Button, Select, TextField } from '../../ui';
import type { PartDefinition, ScenePart } from '../contracts';
import type { ProblemAt } from './validate';

export interface PartListProps {
  parts: readonly ScenePart[];
  /** What can be added, in catalogue order. */
  catalogue: readonly PartDefinition[];
  locale: 'en' | 'es';
  selection: string | null;
  problems: readonly ProblemAt[];
  disabled: boolean;
  /** Options in `<optgroup>`s by family (default). `false` keeps the flat list. */
  grouped?: boolean;
  /** Put before the ids of the list, so two lists on one screen never share one. The default keeps the ids as they were. */
  idPrefix?: string;
  onSelect(id: string): void;
  onAdd(catalogueId: string): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
}

/** The one-line description: the text up to the first full stop (the whole text when it has none). */
const firstSentence = (doc: string) => doc.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? doc;

export function PartList(props: PartListProps) {
  const { parts, catalogue, locale, selection, problems, disabled, grouped = true, idPrefix = '' } = props;
  const headingId = `${idPrefix}plant-editor-parts`;
  const docId = `${idPrefix}plant-editor-part-doc`;
  const { t } = useT();
  const text = translatorFor(locale).t; // the catalogue speaks the language it is shown in
  const [choice, setChoice] = useState('');
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle ? catalogue.filter((d) => d.names[locale].toLowerCase().includes(needle)) : catalogue;
  const chosen = shown.find((d) => d.id === choice)?.id ?? shown[0]?.id ?? '';
  const families = [...new Set(shown.map((d) => d.family))];
  const option = (d: PartDefinition) => (
    <option key={d.id} value={d.id}>
      {d.names[locale]}
    </option>
  );
  const description =
    shown.length === 0 ? text('plantEditor.noPartMatches') : firstSentence(catalogue.find((d) => d.id === chosen)?.doc[locale] ?? '');
  const label = (id: string) => catalogue.find((d) => d.id === id)?.names[locale] ?? id;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId}>{t('plantEditor.partsHeading')}</h3>
      <TextField label={text('plantEditor.filterLabel')} value={filter} disabled={disabled} onChange={(e) => setFilter(e.target.value)} />
      <div className="flex items-end gap-2">
        <Select
          label={t('plantEditor.addLabel')}
          value={chosen}
          disabled={disabled}
          aria-describedby={docId}
          onChange={(e) => setChoice(e.target.value)}
        >
          {grouped
            ? families.map((f) => (
                <optgroup key={f} label={text(`plantEditor.family.${f}`)}>
                  {shown.filter((d) => d.family === f).map(option)}
                </optgroup>
              ))
            : shown.map(option)}
        </Select>
        <Button variant="primary" disabled={disabled || !chosen} onClick={() => props.onAdd(chosen)}>
          {t('plantEditor.add')}
        </Button>
      </div>
      <p id={docId} aria-live="polite">
        {description}
      </p>
      {parts.length === 0 ? (
        <p>{t('plantEditor.listEmpty')}</p>
      ) : (
        <ul aria-label={t('plantEditor.listLabel')} className="flex flex-col gap-1">
          {parts.map((p) => {
            const here = problems.filter((q) => q.partId === p.id);
            const note = `${idPrefix}plant-editor-problems-${p.id}`;
            return (
              <li key={p.id} data-part={p.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant={p.id === selection ? 'primary' : 'secondary'}
                    aria-pressed={p.id === selection}
                    aria-describedby={here.length > 0 ? note : undefined}
                    onClick={() => props.onSelect(p.id)}
                  >
                    {t('plantEditor.partRow', { name: p.name, part: label(p.part) })}
                  </Button>
                  <Button size="sm" disabled={disabled} onClick={() => props.onDuplicate(p.id)}>
                    {t('plantEditor.duplicate', { name: p.name })}
                  </Button>
                  <Button size="sm" variant="danger" disabled={disabled} onClick={() => props.onRemove(p.id)}>
                    {t('plantEditor.remove', { name: p.name })}
                  </Button>
                </div>
                {here.length > 0 && (
                  <ul id={note} className="ui-error">
                    {here.map((q) => (
                      <li key={`${q.path}:${q.message}`}>{q.message}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
