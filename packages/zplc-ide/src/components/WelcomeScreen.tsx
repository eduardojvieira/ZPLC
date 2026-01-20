/**
 * WelcomeScreen Component
 * 
 * Shown when no project is open. Allows the user to:
 * - Open an existing project folder (File System Access API)
 * - Create a new project in a folder
 * - Create a virtual (in-memory) project for unsupported browsers
 * - Open an example project (bundled with the IDE)
 */

import React from 'react';
import { FolderOpen, FolderPlus, FileCode2, AlertTriangle, BookOpen } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { isFileSystemAccessSupported } from '../types';

export function WelcomeScreen() {
  const {
    openProjectFromFolder,
    createNewProjectInFolder,
    createVirtualProject,
    openExampleProject,
    getExampleProjects,
  } = useIDEStore();



  const fsApiSupported = isFileSystemAccessSupported();
  const exampleProjects = getExampleProjects();
  const [appVersion, setAppVersion] = React.useState('1.4.5'); // Default to current version

  React.useEffect(() => {
    const loadVersion = async () => {
      if (window.electronAPI) {
        try {
          const info = await window.electronAPI.getAppInfo();
          setAppVersion(info.version);
        } catch (e) {
          console.error('Failed to get app version:', e);
        }
      }
    };
    loadVersion();
  }, []);

  const handleOpenFolder = async () => {
    await openProjectFromFolder();
  };

  const handleNewProject = async () => {
    await createNewProjectInFolder();
  };

  const handleVirtualProject = () => {
    createVirtualProject('Untitled Project');
  };

  const handleOpenExample = (projectId: string) => {
    openExampleProject(projectId);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--color-surface-900)]">
      {/* Logo & Title */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <FileCode2 size={48} className="text-[var(--color-accent-blue)]" />
          <h1 className="text-4xl font-bold text-[var(--color-surface-100)]">
            ZPLC IDE
          </h1>
        </div>
        <p className="text-[var(--color-surface-400)] text-lg">
          Industrial PLC Development Environment
        </p>
        <p className="text-[var(--color-surface-500)] text-sm mt-1">
          IEC 61131-3 | Structured Text | Ladder | FBD | SFC
        </p>
      </div>

      {/* Action Cards */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
        {/* Open Folder */}
        <button
          onClick={handleOpenFolder}
          disabled={!fsApiSupported}
          className={`group flex flex-col items-center gap-3 p-6 rounded-lg border transition-all
            ${fsApiSupported
              ? 'border-[var(--color-surface-600)] bg-[var(--color-surface-800)] hover:border-[var(--color-accent-blue)] hover:bg-[var(--color-surface-700)] cursor-pointer'
              : 'border-[var(--color-surface-700)] bg-[var(--color-surface-800)]/50 cursor-not-allowed opacity-60'
            }`}
        >
          <FolderOpen
            size={32}
            className={`${fsApiSupported ? 'text-[var(--color-accent-yellow)] group-hover:scale-110 transition-transform' : 'text-[var(--color-surface-500)]'}`}
          />
          <div className="text-center">
            <h3 className="text-[var(--color-surface-100)] font-semibold mb-1">
              Open Folder
            </h3>
            <p className="text-[var(--color-surface-400)] text-sm">
              Open an existing ZPLC project
            </p>
          </div>
        </button>

        {/* New Project */}
        <button
          onClick={handleNewProject}
          disabled={!fsApiSupported}
          className={`group flex flex-col items-center gap-3 p-6 rounded-lg border transition-all
            ${fsApiSupported
              ? 'border-[var(--color-surface-600)] bg-[var(--color-surface-800)] hover:border-[var(--color-accent-green)] hover:bg-[var(--color-surface-700)] cursor-pointer'
              : 'border-[var(--color-surface-700)] bg-[var(--color-surface-800)]/50 cursor-not-allowed opacity-60'
            }`}
        >
          <FolderPlus
            size={32}
            className={`${fsApiSupported ? 'text-[var(--color-accent-green)] group-hover:scale-110 transition-transform' : 'text-[var(--color-surface-500)]'}`}
          />
          <div className="text-center">
            <h3 className="text-[var(--color-surface-100)] font-semibold mb-1">
              New Project
            </h3>
            <p className="text-[var(--color-surface-400)] text-sm">
              Create a new project in a folder
            </p>
          </div>
        </button>

        {/* Virtual Project */}
        <button
          onClick={handleVirtualProject}
          className="group flex flex-col items-center gap-3 p-6 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] hover:border-[var(--color-accent-purple)] hover:bg-[var(--color-surface-700)] cursor-pointer transition-all"
        >
          <FileCode2
            size={32}
            className="text-[var(--color-accent-purple)] group-hover:scale-110 transition-transform"
          />
          <div className="text-center">
            <h3 className="text-[var(--color-surface-100)] font-semibold mb-1">
              Virtual Project
            </h3>
            <p className="text-[var(--color-surface-400)] text-sm">
              In-memory project (no save to disk)
            </p>
          </div>
        </button>
      </div>

      {/* Example Projects */}
      {exampleProjects.length > 0 && (
        <div className="mt-10 w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={18} className="text-[var(--color-accent-cyan)]" />
            <h3 className="text-[var(--color-surface-200)] font-medium">
              Example Projects
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {exampleProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleOpenExample(project.id)}
                className="group flex flex-col items-start gap-1 p-4 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] hover:border-[var(--color-accent-cyan)] hover:bg-[var(--color-surface-700)] cursor-pointer transition-all text-left"
              >
                <h4 className="text-[var(--color-surface-100)] font-medium group-hover:text-[var(--color-accent-cyan)] transition-colors">
                  {project.name}
                </h4>
                {project.description && (
                  <p className="text-[var(--color-surface-400)] text-xs line-clamp-2">
                    {project.description}
                  </p>
                )}
                <span className="text-[var(--color-surface-500)] text-xs mt-1">
                  v{project.version}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Browser Warning */}
      {!fsApiSupported && (
        <div className="mt-8 p-4 bg-[var(--color-surface-800)] border border-[var(--color-accent-orange)] rounded-lg max-w-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-[var(--color-accent-orange)] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[var(--color-accent-orange)] font-medium mb-1">
                Limited Browser Support
              </h4>
              <p className="text-[var(--color-surface-300)] text-sm">
                Your browser doesn't support the File System Access API.
                Use <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Opera</strong> for full functionality
                (open folders, save to disk). You can still use Virtual Projects in this browser.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Projects - Future Enhancement */}
      {/* 
      <div className="mt-12 w-full max-w-md">
        <h3 className="text-[var(--color-surface-300)] text-sm font-medium mb-3">
          Recent Projects
        </h3>
        <div className="text-[var(--color-surface-500)] text-sm text-center py-4">
          No recent projects
        </div>
      </div>
      */}

      <div className="absolute bottom-4 text-center">
        <p className="text-[var(--color-surface-600)] text-xs">
          ZPLC IDE v{appVersion} | Zephyr RTOS Target
        </p>
      </div>
    </div>
  );
}
