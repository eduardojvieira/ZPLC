import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const electronDir = import.meta.dir;
const main = readFileSync(join(electronDir, 'main.ts'), 'utf8');
const preload = readFileSync(join(electronDir, 'preload.ts'), 'utf8');

test('Toolchain Doctor keeps its no-argument human-selected inspection boundary', () => {
  expect(main).toContain("INSPECT: 'toolchain:inspect'");
  expect(main).toContain('ipcMain.handle(TOOLCHAIN_CHANNEL.INSPECT, async (event, ...args: unknown[])');
  expect(main).toContain('const owner = currentRendererOwner(event);');
  expect(main).toContain('if (args.length !== 0 || !owner) {');
  expect(main).toContain("dialog.showOpenDialog(ownerWindow, { properties: ['openDirectory'] })");
  const dialogAwait = main.indexOf('const selection = await dialog.showOpenDialog(ownerWindow');
  const ownerRecheck = main.indexOf('if (!rendererOwnerIsCurrent(owner)) {', dialogAwait);
  const cancelBranch = main.indexOf('if (selection.canceled || selection.filePaths.length !== 1) {', dialogAwait);
  expect(ownerRecheck).toBeGreaterThan(dialogAwait);
  expect(ownerRecheck).toBeLessThan(cancelBranch);
  expect(main).toContain('firmwareBuildGateway.revokeOwner(owner.ownerId);');
  expect(main).toContain("toolchainInspect?: (repositoryRoot: string) => Promise<unknown>");
  expect(main).toContain('firmwareBuildGateway.inspect(owner.ownerId, selection.filePaths[0], toolApi.toolchainInspect)');
  const toolApiImport = main.indexOf('const toolApi = await import(toolApiUrl)', dialogAwait);
  const inspectRecheck = main.indexOf('if (!rendererOwnerIsCurrent(owner)) throw new Error(\'Request denied\');', toolApiImport);
  const gatewayInspect = main.indexOf('firmwareBuildGateway.inspect(owner.ownerId, selection.filePaths[0], toolApi.toolchainInspect)', toolApiImport);
  expect(inspectRecheck).toBeGreaterThan(toolApiImport);
  expect(inspectRecheck).toBeLessThan(gatewayInspect);
  expect(main).toContain("throw new Error('Toolchain inspection failed')");
  expect(preload).toContain("INSPECT: 'toolchain:inspect'");
  expect(preload).toContain('toolchain: {');
  expect(preload).toContain('inspect: () => ipcRenderer.invoke(TOOLCHAIN_CHANNEL.INSPECT) as Promise<unknown | null>');
  expect(preload).not.toContain('inspect: (repositoryRoot');
  expect(preload).not.toContain('inspect: (root');
  expect(preload).not.toContain('filePaths');
});

test('firmware build IPC exposes only exact root-free start and cancel operations', () => {
  for (const channel of ['firmware-build:start', 'firmware-build:cancel']) {
    expect(main).toContain(channel);
    expect(preload).toContain(channel);
  }
  expect(main).toContain('isAllowedFirmwareBuildRequest(request)');
  expect(main).toContain('firmwareBuildGateway.start(owner.ownerId, request, toolApi.toolchainInspect');
  expect(main).toContain("title: 'Build runtime firmware locally'");
  expect(main).toContain("buttons: ['Cancel', 'Build locally']");
  expect(main).toContain('defaultId: 0');
  expect(main).toContain('cancelId: 0');
  expect(main).toContain('firmwareBuildGateway.cancel(owner.ownerId)');
  expect(main).toContain('firmwareBuildGateway.revokeOwner(ownerId);');
  expect(main).toContain('function revokeRendererOwner(ownerId: number): void {');
  expect(preload).toContain('firmwareBuild: {');
  expect(preload).toContain('start: (request: { ideId: string })');
  expect(preload).toContain('cancel: () => ipcRenderer.invoke(FIRMWARE_BUILD_CHANNEL.CANCEL)');
  for (const forbidden of ['firmware-build:flash', 'firmware-build:deploy', 'firmware-build:serial', 'firmware-build:run', 'firmware-build:stop', 'root:', 'cwd:', 'argv:', 'shell:']) {
    expect(preload).not.toContain(forbidden);
  }
});
