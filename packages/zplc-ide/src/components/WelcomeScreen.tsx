/**
 * The first-run surface deliberately offers only project actions that exist today: Open, New, Learn and the bundled
 * examples, grouped by topic with a line that says what each one is (UX-022). Hardware and workspace evidence stay
 * inside an opened project. Folders opened before are listed under Recent and reopen without a dialog (IDE-008).
 */
import React from 'react';
import { BookOpen, FolderOpen, FolderPlus, History } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { LANGUAGE_NAMES, LEVEL_NAMES, boardName, buildExampleSections, type ExampleListing } from '../utils/exampleCatalog';
import { isFileSystemAccessSupported } from '../types';
import { ZPLC_REPO_VERSION } from '../version';
import { learnLessonCatalog } from './learnLesson';
import { ThemeControl } from './ThemeControl';
import { recentRows } from './welcomeRecent';

/** The Learn entry starts the course where the Learn tab starts: with the first lesson, on its own starter project. */
const FIRST_LESSON_STARTER = learnLessonCatalog.en[0]!.starterExampleId;

const badgeClass = 'border border-[var(--border-color)] px-1.5 py-0.5 text-[11px] leading-4 text-[var(--text-secondary)]';

function ExampleBadges({ example }: { example: ExampleListing }) {
  if (example.languages.length === 0 && !example.level && !example.board) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {example.languages.map((language) => (
        <span key={language} className={`${badgeClass} font-mono`}>
          <span aria-hidden="true">{language}</span>
          <span className="sr-only">{LANGUAGE_NAMES[language]}</span>
        </span>
      ))}
      {example.level && <span className={badgeClass}><span className="sr-only">Level: </span>{LEVEL_NAMES[example.level]}</span>}
      {example.board && <span className={badgeClass}><span className="sr-only">Board: </span>{boardName(example.board)}</span>}
    </span>
  );
}

export function WelcomeScreen() {
  const {
    openProjectFromFolder,
    createNewProjectInFolder,
    copyExampleProjectToFolder,
    startLearning,
    getExampleProjects,
    projectOpenError,
    recentProjects,
    refreshRecentProjects,
    openRecentProject,
    forgetRecentProject,
  } = useIDEStore();
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
  const rows = recentRows(recentProjects, now);
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
  const actionClass = `group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)] ${
    unavailable
      ? 'cursor-not-allowed text-[var(--text-primary)] opacity-60'
      : 'text-[var(--text-primary)] hover:bg-[var(--color-surface-700)]'
  }`;

  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-900)] px-5 py-5 text-[var(--text-primary)] sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] pb-5">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">ZPLC Studio 2.0</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Open a project, create one in a folder, start the Learn course, or copy an example you can adapt.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden font-mono text-xs text-[var(--text-muted)] sm:block">build {appVersion}</span>
            <ThemeControl />
          </div>
        </header>

        <section aria-labelledby="project-start-heading" className="pt-6">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="project-start-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Start</h2>
          </div>

          <div className="grid divide-y divide-[var(--border-color)] border border-[var(--border-color)] bg-[var(--color-surface-800)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <button type="button" onClick={() => void openProjectFromFolder()} disabled={unavailable} className={actionClass}>
              <FolderOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">Open project</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">Open an existing project folder from disk.</span>
              </span>
            </button>
            <button type="button" onClick={() => void createNewProjectInFolder()} disabled={unavailable} className={actionClass}>
              <FolderPlus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">New project</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">Create in a folder after checking project-file conflicts.</span>
              </span>
            </button>
            <button type="button" onClick={() => startCopy(() => startLearning(FIRST_LESSON_STARTER))} disabled={unavailable || isCopyingExample} data-welcome-learn className={actionClass}>
              <BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">Learn</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">Start the course: its first lesson is copied into a folder you choose.</span>
              </span>
            </button>
          </div>
        </section>

        {projectOpenError && !recentError && (
          <div role="alert" data-open-error className="mt-4 border border-[var(--color-accent-red)] bg-[var(--color-surface-800)] px-4 py-3 text-sm leading-5">
            <p className="font-medium text-[var(--color-accent-red)]">The project could not be opened</p>
            <p className="mt-1 break-words text-[var(--text-secondary)]">{projectOpenError}</p>
          </div>
        )}

        {rows.length > 0 && (
          <section aria-labelledby="recent-heading" data-recent-projects className="pt-8">
            <h2 id="recent-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent</h2>
            <ul className="mt-3 divide-y divide-[var(--border-color)] border border-[var(--border-color)] bg-[var(--color-surface-800)]">
              {rows.map((row) => (
                <li key={row.recentId} data-recent-project={row.recentId} className="flex flex-wrap items-stretch">
                  <button
                    type="button"
                    onClick={() => reopen(row.recentId)}
                    disabled={!row.available || busy}
                    className="group flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <History size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.name}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">
                        {row.available ? `Opened ${row.opened}` : row.reason}
                      </span>
                    </span>
                  </button>
                  {(!row.available || recentError?.recentId === row.recentId) && (
                    <button
                      type="button"
                      onClick={() => void forgetRecentProject(row.recentId)}
                      aria-label={`Forget ${row.name}`}
                      className="shrink-0 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--color-surface-700)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)]"
                    >
                      Forget
                    </button>
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
            <h2 id="examples-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Examples</h2>
            <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
              Choose or create a destination folder. The copy stops if a destination file already exists.
            </p>
            {exampleSections.map((section) => (
              <section key={section.id} aria-labelledby={`examples-${section.id}`} data-example-group={section.id} className="mt-6">
                <h3 id={`examples-${section.id}`} className="font-medium">{section.title}</h3>
                {section.blurb && <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{section.blurb}</p>}
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {section.examples.map((example) => (
                    <li key={example.id} className="flex">
                      <button
                        type="button"
                        onClick={() => startCopy(() => copyExampleProjectToFolder(example.id))}
                        disabled={unavailable || isCopyingExample}
                        data-welcome-example={example.id}
                        className="flex w-full flex-col items-start gap-1.5 border border-[var(--border-color)] bg-[var(--color-surface-900)] px-3 py-2.5 text-left text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--color-accent-blue)] hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="font-medium">{example.title}</span>
                        <ExampleBadges example={example} />
                        {example.summary && <span data-example-summary className="text-sm leading-5 text-[var(--text-secondary)]">{example.summary}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        )}

        <aside className="mt-6 border-t border-[var(--border-color)] pt-3 text-sm leading-5 text-[var(--text-secondary)]" aria-live="polite">
          {unavailable
            ? 'Folder access is unavailable in this environment.'
            : 'Projects and copied examples are stored in the folder you choose.'}
        </aside>

        <footer className="mt-auto pt-6 font-mono text-xs text-[var(--text-muted)] sm:hidden">build {appVersion}</footer>
      </div>
    </main>
  );
}
