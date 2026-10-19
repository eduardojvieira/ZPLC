/**
 * The first-run surface deliberately offers only project actions that exist today: Open, New, Learn and the bundled
 * examples, grouped by topic with a line that says what each one is (UX-022). Hardware and workspace evidence stay
 * inside an opened project. Folders opened before are listed under Recent and reopen without a dialog (IDE-008).
 */
import React from 'react';
import { BookOpen, FolderOpen, FolderPlus, History } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useNewProjectDialog } from '../store/newProjectDialog';
import { useWelcomeState } from '../store/regionSubscriptions';
import { boardName, buildExampleSections, groupByLevel, languageName, levelName, type ExampleListing } from '../utils/exampleCatalog';
import { isFileSystemAccessSupported } from '../types';
import { ZPLC_REPO_VERSION } from '../version';
import { openLearnHome } from '../learn/learnUi';
import { ImportArchive } from './ImportArchive';
import { ThemeControl } from './ThemeControl';
import { AppPreferences } from './settings/AppPreferences';
import { recentRows } from './welcomeRecent';
import { Button } from '../ui';
import { useT } from '../i18n';


const badgeClass = 'border border-[var(--border-color)] px-1.5 py-0.5 text-[11px] leading-4 text-[var(--text-secondary)]';

function ExampleBadges({ example }: { example: ExampleListing }) {
  const { t } = useT();
  if (example.languages.length === 0 && !example.level && !example.board) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {example.languages.map((language) => (
        <span key={language} className={`${badgeClass} font-mono`}>
          <span aria-hidden="true">{language}</span>
          <span className="sr-only">{languageName(language)}</span>
        </span>
      ))}
      {example.level && <span className={badgeClass}><span className="sr-only">{t('welcome.example.level')} </span>{levelName(example.level)}</span>}
      {example.board && <span className={badgeClass}><span className="sr-only">{t('welcome.example.board')} </span>{boardName(example.board)}</span>}
    </span>
  );
}

export function WelcomeScreen() {
  const translator = useT();
  const { t } = translator;
  const {
    openProjectFromFolder,
    copyExampleProjectToFolder,
    getExampleProjects,
    projectOpenError,
    recentProjects,
    refreshRecentProjects,
    openRecentProject,
    forgetRecentProject,
  } = useWelcomeState();
  const fsApiSupported = isFileSystemAccessSupported();
  const exampleSections = React.useMemo(() => buildExampleSections(getExampleProjects()), [getExampleProjects]);
  const [appVersion, setAppVersion] = React.useState(ZPLC_REPO_VERSION);
  const [isCopyingExample, setIsCopyingExample] = React.useState(false);
  const copyingExampleRef = React.useRef(false);
  // When the list was read; the times on the rows count from it. 0 until the first answer.
  const [now, setNow] = React.useState(0);
  const [openingRecent, setOpeningRecent] = React.useState<string | null>(null);
  const [recentFailure, setRecentFailure] = React.useState<{ recentId: string; message: string } | null>(null);
  const busy = openingRecent !== null;

  React.useEffect(() => {
    void refreshRecentProjects().then(() => setNow(Date.now()));
  }, [refreshRecentProjects]);

  const reopen = (recentId: string) => {
    setOpeningRecent(recentId);
    setRecentFailure(null);
    void openRecentProject(recentId).then(async (opened) => {
      if (opened) return;
      // The reason is shown on the entry that was clicked; the list is read again so that a folder that is gone says so.
      const message = useIDEStore.getState().projectOpenError;
      if (message) setRecentFailure({ recentId, message });
      await refreshRecentProjects();
      setNow(Date.now());
    }).finally(() => setOpeningRecent(null));
  };

  React.useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.getAppInfo().then((info) => setAppVersion(info.version)).catch(() => undefined);
  }, []);

  const unavailable = !fsApiSupported;
  const rows = recentRows(recentProjects, now, translator);
  // A failure to open a recent project is shown on its entry; the general alert shows every other failure.
  const recentError = recentFailure && recentFailure.message === projectOpenError ? recentFailure : null;
  /** Examples and the Learn entry both copy a project into a folder; one copy runs at a time. */
  const startCopy = (start: () => Promise<boolean>) => {
    if (copyingExampleRef.current) return;
    copyingExampleRef.current = true;
    setIsCopyingExample(true);
    void start().finally(() => {
      copyingExampleRef.current = false;
      setIsCopyingExample(false);
    });
  };
  // A start action is a wide row of a title and a sentence: the kit button, with room for wrapped text.
  const actionClass = 'h-auto w-full items-start justify-start gap-3 whitespace-normal px-4 py-3 text-left';

  return (
    <main className="relative flex min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-900)] px-5 py-5 text-[var(--text-primary)] sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] pb-5">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">{t('welcome.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              {t('welcome.intro')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden font-mono text-xs text-[var(--text-muted)] sm:block">{t('welcome.build', { version: appVersion })}</span>
            <ThemeControl />
          </div>
        </header>

        <section aria-labelledby="project-start-heading" className="pt-6">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="project-start-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{t('welcome.start.heading')}</h2>
          </div>

          <div className="grid divide-y divide-[var(--border-color)] border border-[var(--border-color)] bg-[var(--color-surface-800)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Button variant="ghost" onClick={() => void openProjectFromFolder()} disabled={unavailable} className={actionClass}>
              <FolderOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">{t('welcome.open.title')}</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">{t('welcome.open.hint')}</span>
              </span>
            </Button>
            <Button variant="ghost" onClick={() => useNewProjectDialog.getState().show()} disabled={unavailable} className={actionClass}>
              <FolderPlus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">{t('welcome.new.title')}</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">{t('welcome.new.hint')}</span>
              </span>
            </Button>
            <Button variant="ghost" onClick={openLearnHome} disabled={isCopyingExample} data-welcome-learn className={actionClass}>
              <BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">{t('welcome.learn.title')}</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">{t('welcome.learn.hint')}</span>
              </span>
            </Button>
          </div>
          <ImportArchive disabled={unavailable || isCopyingExample} />
        </section>

        {projectOpenError && !recentError && (
          <div role="alert" data-open-error className="mt-4 border border-[var(--color-accent-red)] bg-[var(--color-surface-800)] px-4 py-3 text-sm leading-5">
            <p className="font-medium text-[var(--color-accent-red)]">{t('welcome.openError')}</p>
            <p className="mt-1 break-words text-[var(--text-secondary)]">{projectOpenError}</p>
          </div>
        )}

        {rows.length > 0 && (
          <section aria-labelledby="recent-heading" data-recent-projects className="pt-8">
            <h2 id="recent-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{t('welcome.recent.heading')}</h2>
            <ul className="mt-3 divide-y divide-[var(--border-color)] border border-[var(--border-color)] bg-[var(--color-surface-800)]">
              {rows.map((row) => (
                <li key={row.recentId} data-recent-project={row.recentId} className="flex flex-wrap items-stretch">
                  <Button variant="ghost" size="sm" onClick={() => reopen(row.recentId)} disabled={!row.available || busy} className="h-auto min-w-0 flex-1 items-start justify-start gap-3 whitespace-normal px-4 py-3 text-left">
                    <History size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.name}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">
                        {row.available ? t('welcome.recent.opened', { when: row.opened }) : row.reason}
                      </span>
                    </span>
                  </Button>
                  {(!row.available || recentError?.recentId === row.recentId) && (
                    <Button variant="secondary" size="sm" onClick={() => void forgetRecentProject(row.recentId)} aria-label={t('welcome.recent.forgetLabel', { name: row.name })} className="shrink-0">
                      {t('welcome.recent.forget')}
                    </Button>
                  )}
                  {recentError?.recentId === row.recentId && (
                    <p role="alert" data-recent-error className="w-full break-words px-4 pb-3 text-sm leading-5 text-[var(--color-accent-red)]">{recentError.message}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {exampleSections.length > 0 && (
          <section aria-labelledby="examples-heading" className="pt-8">
            <h2 id="examples-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{t('welcome.examples.heading')}</h2>
            <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
              {t('welcome.examples.hint')}
            </p>
            {exampleSections.map((section) => (
              <section key={section.id} aria-labelledby={`examples-${section.id}`} data-example-group={section.id} className="mt-6">
                <h3 id={`examples-${section.id}`} className="font-medium">{section.title}</h3>
                {section.blurb && <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{section.blurb}</p>}
                {groupByLevel(section.examples).map((levelGroup) => (
                  <div key={levelGroup.level ?? 'unlevelled'} data-example-level={levelGroup.level ?? undefined}>
                    {/* A topic that holds one level needs no level heading: the card carries the level badge. */}
                    {levelGroup.level && groupByLevel(section.examples).length > 1 && (
                      <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{levelName(levelGroup.level)}</h4>
                    )}
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {levelGroup.examples.map((example) => (
                        <li key={example.id} className="flex">
                          <Button variant="secondary" size="sm" onClick={() => startCopy(() => copyExampleProjectToFolder(example.id))} disabled={unavailable || isCopyingExample} data-welcome-example={example.id} className="w-full flex-col items-start text-left duration-150">
                            <span className="font-medium">{example.title}</span>
                            <ExampleBadges example={example} />
                            {example.summary && <span data-example-summary className="text-sm leading-5 text-[var(--text-secondary)]">{example.summary}</span>}
                            {example.noScenario && <span data-example-no-scenario className="text-xs leading-4 text-[var(--text-secondary)]">{example.noScenario}</span>}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </section>
        )}

        <details data-welcome-preferences className="mt-6 border-t border-[var(--border-color)] pt-3">
          <summary className="cursor-pointer text-sm text-[var(--text-secondary)]">{t('welcome.preferences.summary')}</summary>
          <div className="mt-3"><AppPreferences includeTheme={false} /></div>
        </details>

        <aside className="mt-6 border-t border-[var(--border-color)] pt-3 text-sm leading-5 text-[var(--text-secondary)]" aria-live="polite">
          {unavailable
            ? t('welcome.folderAccessUnavailable')
            : t('welcome.storedInFolder')}
        </aside>

        <footer className="mt-auto pt-6 font-mono text-xs text-[var(--text-muted)] sm:hidden">{t('welcome.build', { version: appVersion })}</footer>
      </div>
    </main>
  );
}
