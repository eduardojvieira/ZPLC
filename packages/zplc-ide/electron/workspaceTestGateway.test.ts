import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorkspaceTestGateway } from './workspaceTestGateway';

const temporaryRoots: string[] = [];

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-workspace-gateway-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Workspace test gateway', () => {
  it('registers one opaque workspace and passes only its canonical root to its owner runner', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();

    const token = await gateway.register(7, root);
    expect(Object.keys(token)).toEqual(['workspaceId']);
    expect(JSON.stringify(token)).not.toContain(root);

    const result = await gateway.run(7, token, async (...args) => {
      expect(args[0]).toBe(root);
      expect(args[1]?.signal).toBeInstanceOf(AbortSignal);
      return 'completed';
    });
    expect(result).toBe('completed');
  });

  it('registers only a direct zplc.json manifest and keeps its parent root opaque', async () => {
    const root = await workspace();
    const manifest = join(root, 'zplc.json');
    await writeFile(manifest, '{}');
    const gateway = createWorkspaceTestGateway();

    const token = await gateway.registerProjectManifest(7, manifest);
    await expect(gateway.run(7, token, async (receivedRoot) => receivedRoot)).resolves.toBe(root);

    for (const invalid of [join(root, 'other.json'), 'zplc.json', root]) {
      await expect(gateway.registerProjectManifest(7, invalid)).rejects.toThrow('Workspace is unavailable');
    }
  });

  it('rejects a manifest symlink where supported', async () => {
    const root = await workspace();
    const manifest = join(root, 'zplc.json');
    const target = join(root, 'manifest-target.json');
    await writeFile(target, '{}');
    const gateway = createWorkspaceTestGateway();
    try {
      await symlink(target, manifest, 'file');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === 'EPERM' || code === 'EACCES') return;
      throw error;
    }

    await expect(gateway.registerProjectManifest(7, manifest)).rejects.toThrow('Workspace is unavailable');
  });

  it('fails closed for paths and token envelopes that do not match its current owner', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const token = await gateway.register(7, root);
    const rejected = async (operation: () => Promise<unknown>) => {
      await expect(operation()).rejects.toThrow('Workspace is unavailable');
    };

    await rejected(() => gateway.register(0, root));
    await rejected(() => gateway.register(1, 'relative'));
    await rejected(() => gateway.register(1, __filename));
    await rejected(() => gateway.run(8, token, async () => undefined));
    await rejected(() => gateway.run(7, { workspaceId: `${token.workspaceId}-extra` }, async () => undefined));
    await rejected(() => gateway.run(7, { workspaceId: token.workspaceId, extra: true }, async () => undefined));
    await rejected(() => gateway.run(7, Object.create(null), async () => undefined));
    await gateway.run(8, token, async () => undefined).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(root);
    });
  });

  it('rejects symbolic-link roots when the operating system permits creating them', async () => {
    const root = await workspace();
    const link = `${root}-link`;
    const gateway = createWorkspaceTestGateway();
    try {
      await symlink(root, link, 'junction');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === 'EPERM' || code === 'EACCES') return;
      throw error;
    }
    temporaryRoots.push(link);

    await expect(gateway.register(7, link)).rejects.toThrow('Workspace is unavailable');
  });

  it('rejects a removed or replaced root before it invokes the runner', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const token = await gateway.register(7, root);
    let called = false;
    await rm(root, { recursive: true, force: true });
    await expect(gateway.run(7, token, async () => { called = true; })).rejects.toThrow('Workspace is unavailable');
    expect(called).toBe(false);

    const replaced = await workspace();
    const secondGateway = createWorkspaceTestGateway();
    const secondToken = await secondGateway.register(7, replaced);
    await rm(replaced, { recursive: true, force: true });
    await mkdir(replaced);
    called = false;
    await expect(secondGateway.run(7, secondToken, async () => { called = true; })).rejects.toThrow('Workspace is unavailable');
    expect(called).toBe(false);
  });

  it('permits only one in-flight operation and recovers after runner rejection', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const registering = gateway.register(7, root);
    await expect(gateway.register(7, root)).rejects.toThrow('Workspace is unavailable');
    const token = await registering;
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const running = gateway.run(7, token, () => new Promise<void>((resolve) => {
      release = resolve;
      markStarted?.();
    }));
    await started;

    await expect(gateway.run(7, token, async () => undefined)).rejects.toThrow('Workspace is unavailable');
    await expect(gateway.register(7, root)).rejects.toThrow('Workspace is unavailable');
    release?.();
    await running;

    await expect(gateway.run(7, token, async () => { throw new Error(root); })).rejects.toThrow('Workspace is unavailable');
    await expect(gateway.run(7, token, async () => 'recovered')).resolves.toBe('recovered');
  });

  it('cancels only its active owner and releases the slot after the runner settles', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const token = await gateway.register(7, root);
    let release: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const running = gateway.run(7, token, async (_root, options) => {
      signal = options.signal;
      markStarted?.();
      await new Promise<void>((resolve) => { release = resolve; });
      return 'done';
    });
    await started;
    expect(gateway.cancel(8)).toEqual({ requested: false });
    expect(gateway.cancel(7)).toEqual({ requested: true });
    expect(signal?.aborted).toBe(true);
    await expect(gateway.run(7, token, async () => 'early')).rejects.toThrow('Workspace is unavailable');
    release?.();
    await expect(running).resolves.toBe('done');
    await expect(gateway.run(7, token, async () => 'next')).resolves.toBe('next');
  });

  it('aborts an active run when its owner is revoked without releasing it early', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const token = await gateway.register(7, root);
    let release: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const running = gateway.run(7, token, async (_root, options) => {
      signal = options.signal;
      markStarted?.();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await started;
    expect(gateway.revokeOwner(7)).toBe(true);
    expect(signal?.aborted).toBe(true);
    await expect(gateway.register(7, root)).rejects.toThrow('Workspace is unavailable');
    release?.();
    await running;
    await expect(gateway.register(7, root)).resolves.toEqual({ workspaceId: expect.any(String) });
  });

  it('stales prior tokens and only lets the current owner revoke', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const first = await gateway.register(7, root);
    const second = await gateway.register(7, root);
    expect(second.workspaceId).not.toBe(first.workspaceId);
    await expect(gateway.run(7, first, async () => undefined)).rejects.toThrow('Workspace is unavailable');
    expect(gateway.revokeOwner(8)).toBe(false);
    expect(gateway.revokeOwner(7)).toBe(true);
    await expect(gateway.run(7, second, async () => undefined)).rejects.toThrow('Workspace is unavailable');
  });

  it('lets an admitted run finish when its owner revokes during root revalidation', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const token = await gateway.register(7, root);
    let called = false;
    const running = gateway.run(7, token, async () => {
      called = true;
      return 'completed';
    });

    expect(gateway.revokeOwner(7)).toBe(true);
    await expect(running).resolves.toBe('completed');
    expect(called).toBe(true);
    await expect(gateway.run(7, token, async () => undefined)).rejects.toThrow('Workspace is unavailable');
  });

  it('invalidates a pending registration only for its owner', async () => {
    const root = await workspace();
    const gateway = createWorkspaceTestGateway();
    const foreignPending = gateway.register(7, root);
    expect(gateway.revokeOwner(8)).toBe(false);
    await expect(foreignPending).resolves.toEqual({ workspaceId: expect.any(String) });

    const pending = gateway.register(7, root);
    expect(gateway.revokeOwner(7)).toBe(true);
    await expect(pending).rejects.toThrow('Workspace is unavailable');

    const token = await gateway.register(7, root);
    await expect(gateway.run(7, token, async () => 'registered again')).resolves.toBe('registered again');
  });
});
