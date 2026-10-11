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
 * The command that writes the udev rule of the Linux packages (REL-013). electron-builder.yml maps the file to the
 * rules folder of the .deb and the .rpm through fpm, so the path is the one it names.
 *
 * @param {string} projectDir the folder of the Studio package
 */
export function udevRulesCommand(projectDir) {
  const repoRoot = path.resolve(projectDir, '..', '..');
  return {
    command: 'bun',
    args: [path.join(repoRoot, 'scripts', 'release', 'udev-rules.ts'), '--out', path.join(projectDir, 'build', 'linux', '70-zplc-boards.rules')],
  };
}

/**
 * The commands that the hook runs for a platform: the notices for every installer, and the udev rule for the Linux
 * packages only, so that a macOS or Windows packaging run needs none of the files the rule is generated from.
 *
 * @param {{ packager: { projectDir: string }, electronPlatformName?: string }} context
 */
export function packCommands(context) {
  const { projectDir } = context.packager;
  const commands = [noticesCommand(projectDir)];
  if (context.electronPlatformName === undefined || context.electronPlatformName === 'linux') commands.push(udevRulesCommand(projectDir));
  return commands;
}

/**
 * electron-builder beforePack hook: generates THIRD-PARTY-NOTICES.txt, which extraResources then copies into the
 * resources of every installer, and the udev rule that the Linux packages install. The generators fail on a package
 * or font they have no licence for, or on an identifier that is not valid, which stops the build.
 *
 * @param {{ packager: { projectDir: string }, electronPlatformName?: string }} context
 */
export default async function beforePack(context) {
  for (const { command, args } of packCommands(context)) {
    execFileSync(command, args, { stdio: 'inherit' });
  }
}
