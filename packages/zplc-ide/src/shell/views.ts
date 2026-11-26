/**
 * The table of the views of the two sidebars (SHL-002, SHL-008): the primary views follow the activity rail, the secondary ones are
 * shown one at a time. `Sidebars.tsx` renders from it; each entry names the surface of `surfaces.ts` it is, its title, the command
 * that opens it and its body.
 */
import { createElement, lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n';
import type { CommandId } from '../commands/registry';
import type { ActivityView } from '../store/useShellLayout';
import { useLearnUi } from '../learn/learnUi';
import { useIDEStore } from '../store/useIDEStore';
import { LearnOutline } from '../components/learn/LearnOutline';
import { ProjectExplorer } from '../components/ProjectExplorer';
import { WorkbenchInspector } from '../components/WorkbenchInspector';
import { PlantActivityView } from '../plant/ui/PlantActivityView';
import { GuideView } from '../components/guide/GuideView';
import { lessonSurface } from './shellRouting';
import { SearchView } from './SearchView';
import { TestsView } from './TestsView';
import type { SecondaryView } from './useSelection';

export interface SidebarView {
  /** The surface of `surfaces.ts` this view is. */
  surface: string;
  titleKey: MessageKey;
  command: CommandId;
  Body: ComponentType;
}

/**
 * On the Learn rail the lesson is the Guide of the secondary sidebar (GDE-001); the primary view is then an empty labelled region.
 * With no lesson open it is the course outline (GDE-002).
 */
function LearnBody() {
  const { t } = useT();
  const workspace = useLearnUi((state) => state.workspace);
  const session = useIDEStore((state) => state.projectSession);
  if (lessonSurface('learn', workspace !== null && workspace.session === session) === 'secondary') {
    return createElement('div', { role: 'region', 'aria-label': t('shell.activity.learn') });
  }
  return createElement(LearnOutline);
}

export const PRIMARY_VIEWS: Record<ActivityView, SidebarView> = {
  project: { surface: 'activity.project', titleKey: 'shell.activity.project', command: 'view.showProject', Body: ProjectExplorer },
  search: { surface: 'activity.search', titleKey: 'shell.activity.search', command: 'view.showSearch', Body: SearchView },
  tests: { surface: 'activity.tests', titleKey: 'shell.activity.tests', command: 'view.tests', Body: TestsView },
  plant: { surface: 'activity.plant', titleKey: 'shell.activity.plant', command: 'view.showPlant', Body: PlantActivityView },
  learn: { surface: 'activity.learn', titleKey: 'shell.activity.learn', command: 'view.showLearn', Body: LearnBody },
};

// A chunk of its own: the Assistant holds the review panels and, through them, Monaco, which the Welcome screen must not load (IDE-015).
const AssistantView = lazy(() => import('../components/AssistantView').then((module) => ({ default: module.AssistantView })));
const AssistantBody = (): ReactElement => createElement(Suspense, { fallback: null }, createElement(AssistantView));

/** `lesson` is the id the selection store keeps for the Guide. */
export const SECONDARY_VIEWS: Record<SecondaryView, SidebarView> = {
  lesson: { surface: 'secondary.guide', titleKey: 'shell.secondary.lesson', command: 'view.guide', Body: GuideView },
  inspector: {
    surface: 'secondary.inspector',
    titleKey: 'shell.secondary.inspector',
    command: 'view.toggleSecondarySidebar',
    Body: WorkbenchInspector,
  },
  assistant: { surface: 'secondary.assistant', titleKey: 'shell.secondary.assistant', command: 'view.agent', Body: AssistantBody },
};
