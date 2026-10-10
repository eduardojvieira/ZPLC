import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The command that writes the third-party notices of the installer (REL-019). The script lives at the repository
 * root, two folders above the Studio package, which is also true of the staged copy that the macOS packaging builds.
 *
 * @param {string} projectDir the folder of the Studio package
 */
export function noticesCommand(projectDir) {
  const repoRoot = path.resolve(projectDir, '..', '..');
  return {
    command: 'bun',
    args: [
      path.join(repoRoot, 'scripts', 'release', 'licenses.ts'),
      '--package',
      path.relative(repoRoot, projectDir).split(path.sep).join('/'),
      '--out',
      path.join(projectDir, 'build', 'THIRD-PARTY-NOTICES.txt'),
    ],
  };
}

/**
 * electron-builder beforePack hook: generates THIRD-PARTY-NOTICES.txt, which extraResources then copies into the
 * resources of every installer. The generator fails on a package or font it has no licence for, which stops the build.
 *
 * @param {{ packager: { projectDir: string } }} context
 */
export default async function beforePack(context) {
  const { command, args } = noticesCommand(context.packager.projectDir);
  execFileSync(command, args, { stdio: 'inherit' });
}
