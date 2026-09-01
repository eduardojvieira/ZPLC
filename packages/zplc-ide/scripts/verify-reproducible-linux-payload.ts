import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertPackagedAppAsar,
  assertPackagedRuntime,
  discoverUnpackedResources,
} from './smoke-desktop-builds';

type LinuxPayloadHashes = {
  appAsarSha256: string;
  runtimeSha256: string;
};

function singleLinuxResources(workspace: string): string {
  const resources = discoverUnpackedResources(join(workspace, 'dist-electron'));
  if (resources.length !== 1) {
    throw new Error(`Linux payload reproducibility check requires exactly one unpacked Linux payload in ${workspace}; found ${resources.length}`);
  }
  return resources[0]!;
}

async function sha256(path: string): Promise<string> {
  if (!existsSync(path)) throw new Error(`Linux payload reproducibility check failed: missing ${path}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function hashesFor(workspace: string): Promise<LinuxPayloadHashes> {
  const resources = singleLinuxResources(workspace);
  const appAsar = assertPackagedAppAsar(resources);
  const runtime = assertPackagedRuntime(resources, 'linux', 'x64');
  return {
    appAsarSha256: await sha256(appAsar),
    runtimeSha256: await sha256(runtime),
  };
}

/**
 * Verifies only the Linux x64 packaged application payload, never an installer.
 * The existing desktop smoke helpers reject missing, symlinked, zero-length, or
 * incompatible native runtime files before their bytes are compared.
 */
export async function verifyReproducibleLinuxPayloads(firstWorkspace: string, secondWorkspace: string): Promise<LinuxPayloadHashes> {
  const [first, second] = await Promise.all([hashesFor(firstWorkspace), hashesFor(secondWorkspace)]);
  for (const key of ['appAsarSha256', 'runtimeSha256'] as const) {
    if (first[key] !== second[key]) {
      const label = key === 'appAsarSha256' ? 'app.asar' : 'native runtime';
      throw new Error(`Linux payload reproducibility check failed: ${label} hash mismatch`);
    }
  }
  console.log(`Linux x64 packaged payload reproducibility check passed: app.asar=${first.appAsarSha256} runtime=${first.runtimeSha256}`);
  return first;
}

function parseArguments(argv: readonly string[]): [string, string] {
  if (argv.length === 2 && !argv.some((argument) => argument.startsWith('-'))) return [argv[0]!, argv[1]!];
  throw new Error('Usage: bun run scripts/verify-reproducible-linux-payload.ts <first-workspace> <second-workspace>');
}

if (import.meta.main) {
  const [first, second] = parseArguments(process.argv.slice(2));
  await verifyReproducibleLinuxPayloads(first, second);
}
