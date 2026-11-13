/**
 * The catalogue list and the parts of the scene (SCN-008, SCN-014, SCN-015). Data and callbacks by props: it does not know where it is
 * mounted.
 */
import { useState } from 'react';
import { useT } from '../../i18n';
import { Button, Select } from '../../ui';
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
  onSelect(id: string): void;
  onAdd(catalogueId: string): void;
  onDuplicate(id: string): void;
  onRemove(id: string): void;
}

export function PartList(props: PartListProps) {
  const { parts, catalogue, locale, selection, problems, disabled } = props;
  const { t } = useT();
  const [choice, setChoice] = useState('');
  const chosen = choice || catalogue[0]?.id || '';
  const label = (id: string) => catalogue.find((d) => d.id === id)?.names[locale] ?? id;
  return (
    <section aria-labelledby="plant-editor-parts" className="flex flex-col gap-2">
      <h3 id="plant-editor-parts">{t('plantEditor.partsHeading')}</h3>
      <div className="flex items-end gap-2">
        <Select label={t('plantEditor.addLabel')} value={chosen} disabled={disabled} onChange={(e) => setChoice(e.target.value)}>
          {catalogue.map((d) => (
            <option key={d.id} value={d.id}>
              {d.names[locale]}
            </option>
          ))}
        </Select>
        <Button variant="primary" disabled={disabled || !chosen} onClick={() => props.onAdd(chosen)}>
          {t('plantEditor.add')}
        </Button>
      </div>
      {parts.length === 0 ? (
        <p>{t('plantEditor.listEmpty')}</p>
      ) : (
        <ul aria-label={t('plantEditor.listLabel')} className="flex flex-col gap-1">
          {parts.map((p) => {
            const here = problems.filter((q) => q.partId === p.id);
            const note = `plant-editor-problems-${p.id}`;
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
