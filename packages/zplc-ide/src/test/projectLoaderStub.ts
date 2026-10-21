import { getLanguageFromFilename } from '../types';

/**
 * The stand-in for `utils/projectLoader`, which only loads under Vite (`import.meta.glob`).
 *
 * Bun runs every test file in one process and a `mock.module` outlives its file: a later file that imports the real
 * module's other exports gets "Export named 'x' not found". A file therefore never writes its own partial stub; it
 * calls `await mock.module('<path>/projectLoader', () => projectLoaderStub())`, and the guard in `test-isolation-guard.test.ts`
 * fails when this stub misses an export of the real module or a file writes its own.
 */
export const projectLoaderStub = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
  loadDefaultProject: () => null,
  getDefaultProjectId: () => 'blinky',
  getFileContent: () => null,
  projectExists: () => false,
  getLanguageFromFilename,
  getFileExtension: (language: string) => ({ ST: '.st', IL: '.il', LD: '.ld.json', FBD: '.fbd.json', SFC: '.sfc.json' })[language] ?? '.st',
  ...overrides,
});
