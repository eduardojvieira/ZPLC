import { getLanguageFromFilename } from '../types';

/**
 * The stand-in for `utils/projectLoader`, which only loads under Vite (`import.meta.glob`).
 *
 * Bun runs every test file in one process and a `mock.module` outlives its file: a later file that imports the real
 * module's other exports gets "Export named 'x' not found". A file therefore never writes its own partial stub; it
 * calls `await mock.module('<path>/projectLoader', () => projectLoaderStub())`, and the guard in `tools/ci/test-isolation-guard.test.ts`
 * fails when a file writes its own. The `ProjectLoaderModule` type makes `bun run typecheck` fail when the real module gains an
 * export that this stub lacks.
 */
type ProjectLoaderModule = typeof import('../utils/projectLoader');

export const projectLoaderStub = (overrides: Record<string, unknown> = {}): ProjectLoaderModule => {
  const stub: ProjectLoaderModule = {
    getAvailableProjects: () => [],
    loadProject: () => null,
    loadProjectAssets: () => null,
    loadDefaultProject: () => null,
    getDefaultProjectId: () => 'blinky',
    getFileContent: () => null,
    projectExists: () => false,
    getLanguageFromFilename,
    getFileExtension: (language) => ({ ST: '.st', IL: '.il', LD: '.ld.json', FBD: '.fbd.json', SFC: '.sfc.json' })[language],
  };
  return { ...stub, ...overrides } as ProjectLoaderModule;
};
