/**
 * The References mode of the Search view (FND-004): the places where a name or an address is written, grouped by file, each
 * with its language, its place in words and its role. Arrows move between rows, Enter opens one, Escape returns to Search.
 */
import type { KeyboardEvent } from 'react';
import { lookUp } from '../commands/bind/find';
import { useT } from '../i18n';
import { describeElement } from '../models/sourceElements';
import { Button } from '../ui';
import type { Occurrence, RefTarget } from './contracts';
import { openPlace } from './openPlace';
import { placeFile, summarize, targetName, useReferences } from './useReferences';

export function ReferencesPanel() {
  const { t } = useT();
  const { target, result, status, choice, notice } = useReferences();
  const setMode = useReferences((state) => state.setMode);

  const placeWords = (o: Occurrence): string => {
    const place = o.place;
    switch (place.kind) {
      case 'text':
        return t('refs.place.line', { line: place.line });
      case 'element':
        return describeElement(place.element);
      case 'table':
        return t('search.table', { name: place.name });
      case 'config':
        return t('refs.place.config', { row: place.row });
      case 'watch':
        return t('refs.place.watch', { path: place.path });
      case 'scenario':
        return t('refs.place.scenario', { pointer: place.pointer });
    }
  };
  const row = (o: Occurrence, key: string) => {
    const file = placeFile(o.place) || t('refs.language.WATCH');
    const place = placeWords(o);
    const language = t(`refs.language.${o.language}`);
    const role = t(`refs.role.${o.role}`);
    return (
      <li key={key}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('refs.open', { file, language, place, role })}
          onClick={() => void openPlace(o.place)}
          className="h-auto w-full justify-start gap-2 py-0.5 pl-5 pr-2 text-left font-mono"
        >
          <span className="text-[var(--color-surface-400)]">{language}</span>
          <span className="text-[var(--color-surface-400)] tabular-nums">{place}</span>
          <span className="truncate">{o.text}</span>
          <span className="ml-auto text-[var(--color-surface-300)]">{role}</span>
        </Button>
      </li>
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('search');
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('button')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const groups = new Map<string, Occurrence[]>();
  for (const use of result?.uses ?? []) groups.set(placeFile(use.place), [...(groups.get(placeFile(use.place)) ?? []), use]);
  const name = target ? targetName(target) : '';
  const counts = result ? summarize(result) : null;

  return (
    <div className="py-1" onKeyDown={onKeyDown} data-references-panel aria-live="polite">
      {notice && <p className="px-3 py-1 text-[var(--color-surface-300)]">{notice}</p>}
      {status === 'loading' && <p className="px-3 py-1 text-[var(--color-surface-300)]">{t('refs.loading')}</p>}
      {status === 'failed' && <p className="px-3 py-1 text-[var(--color-accent-red)]">{t('refs.failed')}</p>}
      {choice && (
        <section>
          <h3 className="px-3 pt-2 font-medium text-[var(--color-surface-100)]">{t('refs.choose')}</h3>
          <ul>
            {choice.targets.map((option: RefTarget) => (
              <li key={targetName(option)}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void lookUp(choice.action, option)}
                  className="h-auto w-full justify-start py-0.5 pl-5 pr-2 text-left font-mono"
                >
                  {targetName(option)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result && counts && (
        <>
          <p className="px-3 py-1 text-[var(--color-surface-300)]" data-references-header>
            {t('refs.header', { name, count: counts.uses, files: counts.files })}
          </p>
          {!result.definition && <p className="px-3 py-1 text-[var(--color-accent-yellow)]">{t('refs.notDeclared', { name })}</p>}
          {result.definition && (
            <section>
              <h3 className="px-3 pt-2 font-medium text-[var(--color-surface-100)]">{t('refs.definition')}</h3>
              <ul>{row(result.definition, 'definition')}</ul>
            </section>
          )}
          {result.definition && counts.uses === 0 && (
            <p className="px-3 py-1 text-[var(--color-surface-300)]">{t('refs.noUses', { name })}</p>
          )}
          {result.truncated && <p className="px-3 py-1 text-[var(--color-accent-yellow)]">{t('refs.truncated')}</p>}
          {[...groups].map(([file, uses]) => (
            <section key={file}>
              <h3 className="truncate px-3 pt-2 font-medium text-[var(--color-surface-100)]">{file || t('refs.language.WATCH')}</h3>
              <ul>{uses.map((use, index) => row(use, `${file}:${index}`))}</ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
