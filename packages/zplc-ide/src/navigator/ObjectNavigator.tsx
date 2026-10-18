/** The project navigator organised by PLC objects (UX-012): groups that open, each object opens its file at its line or its configuration editor. */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useT } from '../i18n';
import { useProjectSources } from '../store/projectSources';
import { useIDEStore } from '../store/useIDEStore';
import { projectGlobalVariables } from '../project/globalVariables';
import { Button } from '../ui';
import { buildNavigatorGroups, type NavigatorGroup, type NavigatorGroupId, type NavigatorTarget } from './navigatorGroups';
import { navigatorWords } from './navigatorWords';
import { openConfigEditorFromNavigator } from './openConfigEditor';

interface ObjectNavigatorViewProps {
  groups: readonly NavigatorGroup[];
  collapsed: ReadonlySet<NavigatorGroupId>;
  onToggle: (id: NavigatorGroupId) => void;
  onOpen: (target: NavigatorTarget) => void;
}

export function ObjectNavigatorView({ groups, collapsed, onToggle, onOpen }: ObjectNavigatorViewProps) {
  const { t } = useT();
  return (
    <nav aria-label={t('navigator.region.label')} data-object-navigator className="h-full overflow-y-auto py-1 font-sans text-sm">
      {groups.map((group) => {
        const open = !collapsed.has(group.id);
        const title = t(group.titleKey);
        return (
          <section key={group.id} data-navigator-group={group.id}>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              onClick={() => onToggle(group.id)}
              className="w-full justify-start gap-1 px-2"
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className="font-medium">{title}</span>
              <span className="ml-auto text-[var(--color-surface-300)] tabular-nums">{group.items.length}</span>
            </Button>
            {open && (group.items.length === 0
              ? <p className="px-8 py-1 text-[var(--color-surface-400)]">{t('navigator.empty')}</p>
              : (
                <ul>
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <Button variant="ghost" size="sm" onClick={() => onOpen(item.target)} className="h-auto w-full justify-start gap-2 py-1 pl-8 pr-2 text-left whitespace-normal">
                        <span className="truncate">{item.label}</span>
                        {item.detail && <span className="ml-auto truncate text-[var(--color-surface-400)]">{item.detail}</span>}
                      </Button>
                    </li>
                  ))}
                </ul>
              ))}
          </section>
        );
      })}
    </nav>
  );
}

export function ObjectNavigator() {
  const translator = useT();
  const sources = useProjectSources((state) => state.sources);
  const declarations = useProjectSources((state) => state.declarations);
  const fileTree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const open = useIDEStore((state) => state.navigateToCompilerDiagnostic);
  const [collapsed, setCollapsed] = useState<ReadonlySet<NavigatorGroupId>>(new Set());
  const globals = useMemo(() => projectGlobalVariables(sources), [sources]);
  const groups = useMemo(
    () => buildNavigatorGroups({ declarations, globals, fileTree, config }, navigatorWords(translator)),
    [declarations, globals, fileTree, config, translator],
  );
  const toggle = (id: NavigatorGroupId): void => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const onOpen = (target: NavigatorTarget): void => {
    if (target.kind === 'source') void open(target.path, target.line, target.column);
    else openConfigEditorFromNavigator(target.editor);
  };
  return <ObjectNavigatorView groups={groups} collapsed={collapsed} onToggle={toggle} onOpen={onOpen} />;
}
