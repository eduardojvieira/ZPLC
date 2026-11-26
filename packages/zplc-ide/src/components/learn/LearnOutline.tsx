/**
 * The course outline of the Learn activity (GDE-002): the paths, then the modules, each open or closed, each lesson with its state
 * as an icon and a text, the current lesson marked, a filter, and for a locked lesson what unlocks it (a tooltip on hover and on
 * focus). The rows are `courseOutline.ts`; this renders them and handles the keys of the WAI-ARIA tree (`ui/logic/tree.ts`), plus
 * type-ahead: a letter typed on a row goes to the filter.
 *
 * Choosing a lesson opens it as the Learn home does: its reading page when it has one, else `startLesson`. A locked lesson does not
 * open; its reason is announced.
 */
import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, Lock, type LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { LESSON_INDEX } from '../../generated/lessonIndex';
import { buildCourseView, type LessonState } from '../../learn/course';
import { useLearnUi } from '../../learn/learnUi';
import type { LessonIndex } from '../../learn/lessonPackage';
import { useLearnProgress } from '../../learn/progressState';
import { useAppSettings } from '../../store/useAppSettings';
import { useT, type MessageKey } from '../../i18n';
import { announce } from '../../utils/announce';
import { TextField, Tooltip } from '../../ui';
import { treeKey } from '../../ui/logic/tree';
import { buildCourseOutlineRows, initialExpanded, type OutlineRow } from './courseOutline';

const STATE_ICONS: Record<LessonState, LucideIcon> = {
  locked: Lock,
  available: Circle,
  'in-progress': CircleDot,
  passed: CircleCheck,
};

export function LearnOutline({ index = LESSON_INDEX }: { index?: LessonIndex }) {
  const { t, locale } = useT();
  const progress = useLearnProgress((state) => state.document);
  const unlockAll = useAppSettings((state) => state.settings.unlockAllLessons);
  const selected = useLearnUi((state) => state.selected);
  const view = buildCourseView(index, progress, { locale, unlockAll });
  const currentLessonId = selected ?? progress?.last?.lessonId ?? null;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => initialExpanded(view, currentLessonId));
  const [filter, setFilter] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const root = useRef<HTMLUListElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const rows = buildCourseOutlineRows(view, { expanded, filter, currentLessonId });
  const active = rows.find((row) => row.id === focusId)?.id ?? rows.find((row) => row.current)?.id ?? rows[0]?.id ?? null;

  // ponytail: while a filter is typed every match is shown open; closing a container then changes only the state the filter restores.
  const toggle = (id: string, open: boolean): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const move = (id: string): void => {
    setFocusId(id);
    queueMicrotask(() => root.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus());
  };
  const reasonOf = (row: OutlineRow): string =>
    t(row.pathId ? 'u3Learn.outline.lockedByPath' : 'u3Learn.outline.lockedBy', { lessons: row.unlockedBy.join(', ') });
  const choose = (row: OutlineRow): void => {
    if (row.kind !== 'lesson') {
      toggle(row.id, !row.expanded);
      return;
    }
    if (row.state === 'locked') {
      announce(reasonOf(row));
      return;
    }
    const id = row.lessonId!;
    const ui = useLearnUi.getState();
    if (index.lessons.find((lesson) => lesson.id === id)?.reading) {
      ui.select(id);
      ui.openReading(id);
    } else if (!ui.starting) void ui.startLesson(id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: OutlineRow): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(row);
      return;
    }
    // Type-ahead: the letter goes to the filter, which takes the focus before the key is typed.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      filterInput.current?.focus();
      return;
    }
    const result = treeKey(event.key, rows, row.id);
    if (!result) return;
    event.preventDefault();
    if (result.expand) toggle(result.expand.id, result.expand.open);
    if (result.active !== row.id) move(result.active);
  };

  const renderRow = (row: OutlineRow) => {
    const Icon = row.state ? STATE_ICONS[row.state] : null;
    const item = (
      <div
        role="treeitem"
        data-row={row.id}
        data-state={row.state ?? undefined}
        data-outline-path={row.kind === 'lesson' ? (row.pathId ?? undefined) : undefined}
        data-outline-module={row.kind === 'lesson' && row.moduleId !== null ? row.moduleId : undefined}
        tabIndex={row.id === active ? 0 : -1}
        aria-level={row.level}
        aria-setsize={row.setSize}
        aria-posinset={row.position}
        aria-expanded={row.expandable ? row.expanded : undefined}
        aria-current={row.current ? 'true' : undefined}
        aria-disabled={row.state === 'locked' ? 'true' : undefined}
        className="ui-treeitem flex items-center gap-1.5"
        style={{ paddingInlineStart: `${(row.level - 1) * 1}rem` }}
        onClick={() => {
          setFocusId(row.id);
          choose(row);
        }}
        onKeyDown={(event) => onKeyDown(event, row)}
      >
        <span aria-hidden="true" className="ui-tree-twisty">
          {row.expandable ? row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>
        {Icon && row.state && (
          <span data-outline-state-icon={row.state} className="shrink-0">
            <Icon size={12} aria-hidden="true" />
          </span>
        )}
        <span className={row.kind === 'lesson' ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate font-medium'}>{row.label}</span>
        {row.state && (
          <span data-outline-state-text className="shrink-0 text-xs text-[var(--color-surface-400)]">
            {t(`learn.state.${row.state}` as MessageKey)}
          </span>
        )}
        {row.current && <span className="shrink-0 text-xs font-medium">{t('u3Learn.outline.current')}</span>}
      </div>
    );
    return (
      <li key={row.id} role="none">
        {row.state === 'locked' ? (
          <Tooltip content={reasonOf(row)} placement="right">
            {item}
          </Tooltip>
        ) : (
          item
        )}
      </li>
    );
  };

  return (
    <div data-learn-outline className="flex min-h-0 flex-col gap-2 p-2">
      <TextField
        ref={filterInput}
        label={t('u3Learn.outline.filterLabel')}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {filter.trim() !== '' && rows.length === 0 && (
        <p role="status" className="text-xs text-[var(--color-surface-400)]">
          {t('u3Learn.outline.filterEmpty', { query: filter.trim() })}
        </p>
      )}
      <ul ref={root} role="tree" aria-label={t('u3Learn.outline.title')} className="ui-tree min-h-0 overflow-auto">
        {rows.map(renderRow)}
      </ul>
    </div>
  );
}
