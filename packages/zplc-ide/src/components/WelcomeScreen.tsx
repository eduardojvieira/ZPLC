/**
 * The first-run surface deliberately offers only project actions that exist
 * today. Hardware and workspace evidence stay inside an opened project.
 */
import React from 'react';
import { BookOpen, FolderOpen, FolderPlus, Moon, Sun } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useTheme } from '../hooks/useTheme';
import { isFileSystemAccessSupported } from '../types';
import { ZPLC_REPO_VERSION } from '../version';

export function WelcomeScreen() {
  const {
    openProjectFromFolder,
    createNewProjectInFolder,
    copyExampleProjectToFolder,
    getExampleProjects,
  } = useIDEStore();
  const { isDark, setTheme } = useTheme();
  const fsApiSupported = isFileSystemAccessSupported();
  const exampleProjects = getExampleProjects();
  const [appVersion, setAppVersion] = React.useState(ZPLC_REPO_VERSION);
  const [isCopyingExample, setIsCopyingExample] = React.useState(false);
  const copyingExampleRef = React.useRef(false);

  React.useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.getAppInfo().then((info) => setAppVersion(info.version)).catch(() => undefined);
  }, []);

  const unavailable = !fsApiSupported;
  const actionClass = `group grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border-color)] px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)] ${
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
              Open a project, create one in a folder, or copy an example you can adapt.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden font-mono text-xs text-[var(--text-muted)] sm:block">build {appVersion}</span>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
              title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
              className="grid size-9 place-items-center border border-[var(--border-color)] bg-[var(--color-surface-800)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--color-surface-700)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
            >
              {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
          </div>
        </header>

        <section aria-labelledby="project-start-heading" className="pt-6">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="project-start-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Project start</h2>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--color-surface-800)]">
            <button type="button" onClick={() => void openProjectFromFolder()} disabled={unavailable} className={actionClass}>
              <FolderOpen size={18} aria-hidden="true" className="text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">Open project</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">Open an existing project folder from disk.</span>
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)]">OPEN</span>
            </button>
            <button type="button" onClick={() => void createNewProjectInFolder()} disabled={unavailable} className={actionClass}>
              <FolderPlus size={18} aria-hidden="true" className="text-[var(--color-accent-blue)]" />
              <span className="min-w-0">
                <span className="block font-medium">New project</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--text-secondary)]">Create in a folder after checking project-file conflicts.</span>
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)]">NEW</span>
            </button>
            <div className="px-4 py-3">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                <BookOpen size={18} aria-hidden="true" className="mt-0.5 text-[var(--color-accent-blue)]" />
                <div>
                  <h3 className="font-medium">Copy example</h3>
                  <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">
                    Choose or create a destination folder. The copy stops if a destination file already exists.
                  </p>
                  {exampleProjects.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {exampleProjects.map((project) => (
                        <button
                          type="button"
                          key={project.id}
                          onClick={() => {
                            if (copyingExampleRef.current) return;
                            copyingExampleRef.current = true;
                            setIsCopyingExample(true);
                            void copyExampleProjectToFolder(project.id).finally(() => {
                              copyingExampleRef.current = false;
                              setIsCopyingExample(false);
                            });
                          }}
                          disabled={unavailable || isCopyingExample}
                          data-welcome-example
                          className="border border-[var(--border-color)] bg-[var(--color-surface-900)] px-2.5 py-1.5 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--color-accent-blue)] hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
                        >
                          {project.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

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
