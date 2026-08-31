import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = pathToFileURL(resolve(packageRoot, 'electron-dist/toolApi.js')).href;
const toolApi = await import(bundle);
const requiredExports = ['projectInspect', 'projectMigrationPreview', 'projectValidate', 'compilerCheck', 'compilerCompile', 'testsRun', 'createCandidateChangeSet', 'toolchainInspect', 'firmwareBuild'];
const missing = requiredExports.filter((name) => typeof toolApi[name] !== 'function');

if (missing.length > 0) {
  throw new Error(`Tool API bundle is missing callable exports: ${missing.join(', ')}`);
}
