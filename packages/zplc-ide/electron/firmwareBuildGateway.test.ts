import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFirmwareBuildGateway } from './firmwareBuildGateway';

const roots: string[] = [];
const ready = (boards = [{ ideId: 'nucleo_h743zi', zephyrBoard: 'nucleo_h743zi', validationLevel: 'cross-build' }]) => ({ ok: true, summary: { ready: true, boards }, evidence: { diagnostics: [] } });
const attention = () => ({ ok: false, summary: { ready: false, boards: [] }, evidence: { diagnostics: [] } });
async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'zplc-firmware-gateway-')); roots.push(value); return value; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))); });

describe('firmware build gateway', () => {
  it('keeps the admitted root opaque and passes its canonical value only to trusted callbacks', async () => {
    const candidate = await root();
    const gateway = createFirmwareBuildGateway();
    const inspected = await gateway.inspect(7, candidate, async (value) => { expect(value).toBe(candidate); return ready(); });
    expect(JSON.stringify(inspected)).not.toContain(candidate);
    const result = await gateway.start(7, { ideId: 'nucleo_h743zi' }, async (value) => { expect(value).toBe(candidate); return ready(); }, async () => true, async (value, id) => { expect(value).toBe(candidate); expect(id).toBe('nucleo_h743zi'); return { ok: true }; });
    expect(result).toEqual({ ok: true });
  });

  it('clears the prior selection on invalid, attention, symlink, or replaced roots before any build', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway();
    await gateway.inspect(7, candidate, async () => ready());
    await expect(gateway.inspect(7, 'relative', async () => ready())).rejects.toThrow('Firmware build unavailable');
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => ({ ok: true }))).rejects.toThrow('Firmware build unavailable');
    await expect(gateway.inspect(7, candidate, async () => attention())).resolves.toEqual(attention());
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => ({ ok: true }))).rejects.toThrow('Firmware build unavailable');
    const link = `${candidate}-link`; await symlink(candidate, link); roots.push(link);
    await expect(gateway.inspect(7, link, async () => ready())).rejects.toThrow('Firmware build unavailable');
    await gateway.inspect(7, candidate, async () => ready());
    await rm(candidate, { recursive: true, force: true }); await mkdir(candidate);
    let built = false;
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => { built = true; return {}; })).rejects.toThrow('Firmware build unavailable');
    expect(built).toBe(false);
  });

  it('requires a repeated ready preflight, exact ideId, approval, and a single operation', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway();
    let inspections = 0; let release: (() => void) | undefined;
    await gateway.inspect(7, candidate, async () => { inspections += 1; return ready(); });
    await expect(gateway.start(7, { ideId: 'Nucleo_h743zi' }, async () => ready(), async () => true, async () => ({}))).rejects.toThrow('Firmware build unavailable');
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi', extra: true }, async () => ready(), async () => true, async () => ({}))).rejects.toThrow('Firmware build unavailable');
    let started: (() => void) | undefined; const startedBuild = new Promise<void>((resolve) => { started = resolve; });
    const running = gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => { inspections += 1; return ready(); }, async () => true, () => new Promise((resolve) => { release = () => resolve({ ok: true }); started?.(); }));
    await startedBuild;
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => ({}))).rejects.toThrow('Firmware build unavailable');
    await expect(gateway.inspect(7, candidate, async () => ready())).rejects.toThrow('Firmware build unavailable');
    release?.();
    await expect(running).resolves.toEqual({ ok: true });
    expect(inspections).toBe(2);
  });

  it('does not build after approval cancellation and aborts only the active owner on cancel or revoke', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway(); await gateway.inspect(7, candidate, async () => ready());
    let built = false;
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => false, async () => { built = true; return {}; })).resolves.toBeNull();
    expect(built).toBe(false);
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => { throw new Error(candidate); }, async () => ({}))).rejects.toThrow('Firmware build unavailable');
    let signal: AbortSignal | undefined; let release: (() => void) | undefined;
    let started: (() => void) | undefined; const startedBuild = new Promise<void>((resolve) => { started = resolve; });
    const running = gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, (_root, _id, options) => new Promise((resolve) => { signal = options.signal; release = () => resolve({ ok: !options.signal.aborted }); started?.(); }));
    await startedBuild; expect(gateway.cancel(8)).toEqual({ requested: false }); expect(gateway.cancel(7)).toEqual({ requested: true }); expect(signal?.aborted).toBe(true);
    release?.(); await expect(running).resolves.toEqual({ ok: false });
    await gateway.inspect(7, candidate, async () => ready());
    const revokedBuild = new Promise<void>((resolve) => { started = resolve; });
    const revoked = gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, (_root, _id, options) => new Promise((resolve) => { signal = options.signal; release = () => resolve({ ok: !options.signal.aborted }); started?.(); }));
    await revokedBuild; expect(gateway.revokeOwner(7)).toBe(true); expect(signal?.aborted).toBe(true); release?.(); await revoked;
  });

  it('fails closed outside POSIX and never leaks callback errors', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway({ platform: 'win32' });
    await expect(gateway.inspect(7, candidate, async () => ready())).rejects.toThrow('Firmware build unavailable');
    const posix = createFirmwareBuildGateway();
    await expect(posix.inspect(7, candidate, async () => { throw new Error(candidate); })).rejects.toThrow('Firmware build unavailable');
  });

  it('leases inspection exclusively and cannot revive a selection after its owner is revoked', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway(); const inspection = deferred<unknown>();
    const pending = gateway.inspect(7, candidate, async () => inspection.promise);
    await expect(gateway.inspect(7, candidate, async () => ready())).rejects.toThrow('Firmware build unavailable');
    expect(gateway.revokeOwner(7)).toBe(true);
    inspection.resolve(ready());
    await expect(pending).rejects.toThrow('Firmware build unavailable');
    let built = false;
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => { built = true; return {}; })).rejects.toThrow('Firmware build unavailable');
    expect(built).toBe(false);
    await gateway.inspect(7, candidate, async () => ready());
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('cancels before build during preflight or approval and releases only after the owned operation settles', async () => {
    const candidate = await root(); const gateway = createFirmwareBuildGateway(); await gateway.inspect(7, candidate, async () => ready());
    const preflight = deferred<unknown>(); let approved = false; let built = false;
    const pendingPreflight = gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => preflight.promise, async () => { approved = true; return true; }, async () => { built = true; return {}; });
    expect(gateway.cancel(7)).toEqual({ requested: true }); preflight.resolve(ready());
    await expect(pendingPreflight).resolves.toBeNull(); expect(approved).toBe(false); expect(built).toBe(false);
    await gateway.inspect(7, candidate, async () => ready());
    const approval = deferred<boolean>();
    const approvalStarted = deferred<void>();
    const pendingApproval = gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => { approvalStarted.resolve(); return approval.promise; }, async () => { built = true; return {}; });
    await approvalStarted.promise; expect(gateway.revokeOwner(7)).toBe(true); approval.resolve(true);
    await expect(pendingApproval).resolves.toBeNull(); expect(built).toBe(false);
    await gateway.inspect(7, candidate, async () => ready());
    await expect(gateway.start(7, { ideId: 'nucleo_h743zi' }, async () => ready(), async () => true, async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });
});
