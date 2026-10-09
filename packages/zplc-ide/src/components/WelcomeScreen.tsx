/**
 * The first-run surface deliberately offers only project actions that exist today: Open, New, Learn and the bundled
 * examples, grouped by topic with a line that says what each one is (UX-022). Hardware and workspace evidence stay
 * inside an opened project.
 */
import React from 'react';
import { BookOpen, FolderOpen, FolderPlus } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { LANGUAGE_NAMES, LEVEL_NAMES, boardName, buildExampleSections, type ExampleListing } from '../utils/exampleCatalog';
import { isFileSystemAccessSupported } from '../types';
import { ZPLC_REPO_VERSION } from '../version';
import { learnLessonCatalog } from './learnLesson';
import { ThemeControl } from './ThemeControl';

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
  } = useIDEStore();
  const fsApiSupported = isFileSystemAccessSupported();
  const exampleSections = React.useMemo(() => buildExampleSections(getExampleProjects()), [getExampleProjects]);
  const [appVersion, setAppVersion] = React.useState(ZPLC_REPO_VERSION);
  const [isCopyingExample, setIsCopyingExample] = React.useState(false);
  const copyingExampleRef = React.useRef(false);

  React.useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.getAppInfo().then((info) => setAppVersion(info.version)).catch(() => undefined);
  }, []);

  const unavailable = !fsApiSupported;
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

        {projectOpenError && (
          <div role="alert" data-open-error className="mt-4 border border-[var(--color-accent-red)] bg-[var(--color-surface-800)] px-4 py-3 text-sm leading-5">
            <p className="font-medium text-[var(--color-accent-red)]">The project could not be opened</p>
            <p className="mt-1 break-words text-[var(--text-secondary)]">{projectOpenError}</p>
          </div>
        )}

        {/* Recent projects (IDE-008) take their place here, between the start actions and the examples. */}

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
