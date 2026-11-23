/**
 * The place of the active document as PLC objects: project, group, object (FND-007). Each step shows the object navigator there.
 * Only a file or a configuration editor has a place; the review, Preferences, settings and plant documents are not in the project's
 * objects, so they show no bar. The steps are plain buttons in the tab order of the group, after its tab strip.
 */
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useT } from '../i18n';
import { buildNavigatorGroups, type NavigatorGroup, type NavigatorItem } from '../navigator/navigatorGroups';
import { navigatorWords } from '../navigator/navigatorWords';
import { isConfigEditorKind } from '../navigator/configEditors';
import type { ViewId } from '../layout/documentKinds';
import { useProjectSources } from '../store/projectSources';
import { useIDEStore } from '../store/useIDEStore';
import { useNavigatorReveal } from '../store/useNavigationHistory';
import { useShellLayout } from '../store/useShellLayout';
import { projectGlobalVariables } from '../project/globalVariables';
import { Button } from '../ui';

interface Found {
  group: NavigatorGroup;
  item?: NavigatorItem;
}

/** Where a view sits among the navigator's groups: the first object that stands for its file, or the group of its editor. */
function find(groups: readonly NavigatorGroup[], viewId: ViewId, path: string | undefined): Found | null {
  const kind = viewId.startsWith('config:') ? viewId.slice('config:'.length) : null;
  for (const group of groups) {
    for (const item of group.items) {
      const target = item.target;
      if (path !== undefined && target.kind === 'source' && target.path === path) return { group, item };
      if (isConfigEditorKind(kind) && target.kind === 'config' && target.editor === kind) return { group };
    }
  }
  return null;
}

export function PlaceBar({ viewId }: { viewId: ViewId | null }) {
  const translator = useT();
  const { t } = translator;
  const projectName = useIDEStore((state) => state.projectName);
  const fileTree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const path = useIDEStore((state) => (viewId ? state.loadedFiles.get(viewId)?.path : undefined));
  const sources = useProjectSources((state) => state.sources);
  const declarations = useProjectSources((state) => state.declarations);
  const globals = useMemo(() => projectGlobalVariables(sources), [sources]);
  const found = useMemo(
    () =>
      viewId ? find(buildNavigatorGroups({ declarations, globals, fileTree, config }, navigatorWords(translator)), viewId, path) : null,
    [viewId, path, declarations, globals, fileTree, config, translator],
  );
  if (!viewId || (path === undefined && !viewId.startsWith('config:'))) return null;

  const show = (group: string | null, item: string | null): void => {
    useShellLayout.getState().showActivity('project');
    useShellLayout.getState().setNavigatorMode('objects');
    useNavigatorReveal.getState().reveal(group, item);
  };
  const steps = [
    { key: 'project', name: projectName ?? t('placeBar.project'), go: () => show(null, null) },
    ...(found ? [{ key: 'group', name: t(found.group.titleKey), go: () => show(found.group.id, null) }] : []),
    ...(found?.item ? [{ key: 'item', name: found.item.label, go: () => show(found.group.id, found.item!.key) }] : []),
  ];
  return (
    <nav
      aria-label={t('placeBar.label')}
      data-place-bar
      className="flex h-[22px] shrink-0 items-center gap-0.5 border-b border-[var(--color-surface-600)] px-2 text-xs"
    >
      {steps.map((step, index) => (
        <span key={step.key} className="flex min-w-0 items-center gap-0.5">
          {index > 0 && <ChevronRight size={12} aria-hidden="true" className="text-[var(--color-surface-400)]" />}
          <Button
            variant="bare"
            type="button"
            data-command="view.showProject"
            aria-label={t('placeBar.step', { name: step.name })}
            onClick={step.go}
            className={
              'max-w-48 truncate rounded px-1 text-[var(--color-surface-200)] hover:bg-[var(--color-surface-700)] ' +
              'focus-visible:outline'
            }
          >
            {step.name}
          </Button>
        </span>
      ))}
    </nav>
  );
}
