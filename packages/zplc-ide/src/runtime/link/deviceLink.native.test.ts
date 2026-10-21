// The device link against the real native runtime (COM-019 to COM-025, COM-028): Studio's DeviceLink over a pipe to
// `zplc_runtime --device-link`, the same engine and the same frames as firmware. The tests that need the binary
// fail in CI when it is missing (VF-023) and are skipped, with a message, on a machine that has none.
import { afterEach, describe, expect } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ZPLC_CONSTANTS, compileToBinary } from '@zplc/compiler';

import { itNative, nativeRuntimeBinary } from '../../cli/nativeRuntimeGuard';
import { DeviceLink, LinkError, type LinkEvent, type LinkTransport } from './deviceLink';
import { beginFrame, crc32, encodeFrame, finishFrame } from './frame';
import { programSignerOf, publicKeyOf, signProgram } from './signing';
import { CAPABILITY, ENUMS, ERROR, EVENT_MASK, KIND, MESSAGES } from './protocol.generated';

const KEY = Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 0xff);
const KEY_HEX = Buffer.from(KEY).toString('hex');

class ProcessTransport implements LinkTransport {
  readonly child: ChildProcessWithoutNullStreams;
  private readonly handlers = new Set<(bytes: Uint8Array) => void>();
  private readonly closers = new Set<(reason: string) => void>();
  stderr = '';

  constructor(args: string[], environment: Record<string, string>) {
    this.child = spawn(nativeRuntimeBinary, args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk: Buffer) => {
      for (const handler of this.handlers) handler(new Uint8Array(chunk));
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });
    this.child.on('close', (code) => {
      for (const handler of this.closers) handler(`exit ${code}`);
    });
  }

  write(bytes: Uint8Array): void {
    this.child.stdin.write(bytes);
  }
  onData(handler: (bytes: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  onClose(handler: (reason: string) => void): () => void {
    this.closers.add(handler);
    return () => this.closers.delete(handler);
  }
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null) {
        resolve();
        return;
      }
      this.child.once('close', () => resolve());
      this.child.stdin.end();
      setTimeout(() => this.child.kill('SIGTERM'), 1000).unref();
    });
  }
}

const roots: string[] = [];
const transports: ProcessTransport[] = [];

async function start(args: string[], environment: Record<string, string> = {}): Promise<{ link: DeviceLink; transport: ProcessTransport }> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-device-link-'));
  roots.push(root);
  const transport = new ProcessTransport(args, { ZPLC_PERSIST_ROOT: root, ...environment });
  transports.push(transport);
  const link = new DeviceLink(transport, { requestTimeoutMs: 3000 });
  return { link, transport };
}

afterEach(async () => {
  for (const transport of transports.splice(0)) await transport.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const program = (): Uint8Array =>
  new Uint8Array(compileToBinary('PROGRAM Link\nVAR counter : DINT; END_VAR\n counter := counter + 1;\nEND_PROGRAM\n').zplcFile);

async function until<T>(read: () => Promise<T> | T, ok: (value: T) => boolean, what: string, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (ok(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe(
  'the device link over the serial rules, the native runtime on a pipe (COM-019, COM-020, COM-023, COM-024, COM-025, ' + 'COM-028)',
  () => {
    itNative('a hello and an identity recognise the device (COM-019, COM-029)', async () => {
      const { link } = await start(['--device-link']);
      const hello = await link.hello();
      expect(hello).toMatchObject({ version: 1, transport: 'SERIAL', sessionState: 'NONE', keyProvisioned: false, idleTimeoutS: 30 });
      for (const capability of [
        'SESSION',
        'MEMORY',
        'FORCE',
        'RUN_CONTROL',
        'BREAKPOINTS',
        'PROGRAM',
        'EVENTS',
        'WATCH',
        'AUTH',
      ] as const) {
        expect(link.has(capability)).toBe(true);
      }
      expect(link.has('CONFIG')).toBe(false);
      expect(link.has('CREDENTIALS')).toBe(false);
      const identity = await link.request('IDENTITY', {});
      expect(identity).toMatchObject({
        abi_major: ZPLC_CONSTANTS.VERSION_MAJOR,
        abi_minor: ZPLC_CONSTANTS.VERSION_MINOR,
        draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
      });
      expect(identity.board).toBe('native-posix');
      expect(identity.code_size_max).toBeGreaterThan(0);
    });

    itNative('nothing that changes the device works without a session, and nothing of it reaches the runtime (COM-020)', async () => {
      const { link } = await start(['--device-link']);
      await link.hello();
      const refused = async (run: () => Promise<unknown>) => {
        const error = await run().then(
          () => null,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(LinkError);
        expect((error as LinkError).errorName).toBe('NO_SESSION');
      };
      await refused(() => link.request('MEM_WRITE', { address: 0x2000, data: new Uint8Array([1, 2, 3, 4]) }));
      await refused(() => link.request('FORCE_SET', { address: 0x2000, data: new Uint8Array([1]) }));
      await refused(() => link.request('RUN', {}));
      await refused(() => link.request('STOP', {}));
      await refused(() => link.request('PROGRAM_BEGIN', { size: 16, crc32: 0 }));
      await refused(() => link.request('BP_ADD', { pc: 4 }));
      await refused(() => link.request('KEY_SET', { key: KEY }));
      // reads are open on the serial link, and show nothing was changed
      const memory = await link.request('MEM_READ', { address: 0x2000, length: 4 });
      expect([...memory.data]).toEqual([0, 0, 0, 0]);
      expect(await link.request('FORCE_LIST', {})).toMatchObject({ count: 0 });
      expect(await link.request('STATUS', {})).toMatchObject({ state: ENUMS.RUN_STATE.STOPPED, forces: 0 });
      expect(link.snapshot().crcErrors).toBe(0);
    });

    itNative(
      'in a session: an atomic write, a refused range with its region, a force that ends with the session (COM-020, COM-023, COM-024)',
      async () => {
        const { link } = await start(['--device-link']);
        await link.hello();
        const events: LinkEvent[] = [];
        link.onEvent((event) => events.push(event));
        expect(await link.request('EVENTS_SET', { mask: EVENT_MASK.FORCE | EVENT_MASK.STATUS })).toMatchObject({
          mask: EVENT_MASK.FORCE | EVENT_MASK.STATUS,
        });
        const session = await link.openSession({ name: 'unit test' });
        expect(session).toMatchObject({ authenticated: false, idleTimeoutS: 30 });

        await link.request('MEM_WRITE', { address: 0x2010, data: new Uint8Array([0x78, 0x56, 0x34, 0x12]) });
        expect([...(await link.request('MEM_READ', { address: 0x2010, length: 4 })).data]).toEqual([0x78, 0x56, 0x34, 0x12]);

        // COM-024 on the device: the refusal names the address, the length and the region
        const error = await link.request('MEM_WRITE', { address: 0x3ffe, data: new Uint8Array(4) }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(LinkError);
        expect((error as LinkError).range).toEqual({ address: 0x3ffe, length: 4, regionStart: 0x2000, regionEnd: 0x4000 });
        const outside = await link.request('MEM_READ', { address: 0x5000, length: 1 }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect((outside as LinkError).range).toEqual({ address: 0x5000, length: 1, regionStart: 0xffff, regionEnd: 0xffff });
        const output = await link.request('MEM_WRITE', { address: 0x1000, data: new Uint8Array([1]) }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect((output as LinkError).errorName).toBe('RANGE');

        expect(await link.request('FORCE_SET', { address: 0x2020, data: new Uint8Array([0xaa, 0xbb]) })).toMatchObject({ forces: 1 });
        const listed = await link.request('FORCE_LIST', {});
        expect(listed.count).toBe(1);
        expect([...listed.entries]).toEqual([0x20, 0x20, 0x02, 0x00, 0xaa, 0xbb]);

        expect(await link.closeSession()).toBe(1);
        expect(await link.request('FORCE_LIST', {})).toMatchObject({ count: 0 });
        await until(
          () => events,
          (seen) =>
            seen.some((event) => event.name === 'EVT_FORCE' && (event.values as { change: number }).change === ENUMS.FORCE_CHANGE.RELEASED),
          'the event that the forces were released',
        );
        // after the close the same write is refused again
        const again = await link.request('MEM_WRITE', { address: 0x2010, data: new Uint8Array([1]) }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect((again as LinkError).errorName).toBe('NO_SESSION');
      },
    );

    itNative('one session at a time, replaced by its own link, and taken over from the serial link (COM-020)', async () => {
      const { link } = await start(['--device-link']);
      await link.hello();
      await link.openSession({ name: 'first' });
      // the same link opening again is its own session, replaced
      await link.openSession({ name: 'again' });
      expect(await link.request('FORCE_SET', { address: 0x2020, data: new Uint8Array([1]) })).toMatchObject({ forces: 1 });
      await link.openSession({ name: 'again', takeover: true });
      expect(await link.request('FORCE_LIST', {})).toMatchObject({ count: 0 });
    });

    itNative(
      'a download: chunks with progress, a read-back that is the announced CRC-32, STOP afterwards, RUN as its own request (COM-028, ' +
        'COM-025)',
      async () => {
        const { link } = await start(['--device-link']);
        const hello = await link.hello();
        await link.openSession({ name: 'deploy' });
        const bytes = program();
        const announced = crc32(bytes);
        const begun = await link.request('PROGRAM_BEGIN', { size: bytes.length, crc32: announced });
        expect(begun.chunk_max).toBeGreaterThan(0);
        const chunk = Math.min(begun.chunk_max, hello.maxPayload - 4, 64);
        let received = 0;
        const progress: number[] = [];
        while (received < bytes.length) {
          const part = bytes.subarray(received, received + chunk);
          const answer = await link.request('PROGRAM_CHUNK', { offset: received, data: part });
          received = answer.received;
          progress.push(received);
        }
        expect(received).toBe(bytes.length);
        expect(progress.length).toBeGreaterThan(1);
        const committed = await link.request('PROGRAM_COMMIT', {});
        expect(committed).toMatchObject({ size: bytes.length, crc32: announced });
        expect(committed.generation).toBeGreaterThan(0);
        expect(await link.request('PROGRAM_INFO', {})).toMatchObject({ loaded: 1, size: bytes.length, crc32: announced });
        expect(await link.request('STATUS', {})).toMatchObject({ state: ENUMS.RUN_STATE.STOPPED, program_loaded: 1 });

        // RUN is its own request; status events are pushed
        const events: LinkEvent[] = [];
        link.onEvent((event) => events.push(event));
        await link.request('EVENTS_SET', { mask: EVENT_MASK.STATUS });
        await link.request('RUN', {});
        await until(
          () => events,
          (seen) =>
            seen.some((event) => event.name === 'EVT_STATUS' && (event.values as { state: number }).state === ENUMS.RUN_STATE.RUNNING),
          'the event of the state change',
        );
        const status = await until(
          () => link.request('STATUS', {}),
          (value) => value.cycles > 2,
          'scans',
        );
        expect(status.state).toBe(ENUMS.RUN_STATE.RUNNING);
        await link.request('STOP', {});
        await until(
          () => events,
          (seen) =>
            seen.some((event) => event.name === 'EVT_STATUS' && (event.values as { state: number }).state === ENUMS.RUN_STATE.STOPPED),
          'the event of the stop',
        );

        // a program that is not what was announced
        await link.request('PROGRAM_BEGIN', { size: bytes.length, crc32: (announced ^ 1) >>> 0 });
        for (let at = 0; at < bytes.length; at += chunk)
          await link.request('PROGRAM_CHUNK', { offset: at, data: bytes.subarray(at, at + chunk) });
        const bad = await link.request('PROGRAM_COMMIT', {}).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect((bad as LinkError).errorName).toBe('CRC');
        // a download is not accepted while the runtime runs
        await link.request('RUN', {});
        const running = await link.request('PROGRAM_BEGIN', { size: bytes.length, crc32: announced }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect((running as LinkError).errorName).toBe('STATE');
      },
    );

    itNative('breakpoints, and a watch batch with the values of one scan (COM-025)', async () => {
      const { link } = await start(['--device-link']);
      await link.hello();
      await link.openSession({});
      expect(await link.request('BP_ADD', { pc: 4 })).toMatchObject({ count: 1 });
      expect(await link.request('BP_LIST', {})).toMatchObject({ count: 1 });
      expect(await link.request('BP_CLEAR', {})).toEqual({});
      const events: LinkEvent[] = [];
      link.onEvent((event) => events.push(event));
      await link.request('MEM_WRITE', { address: 0x2000, data: new Uint8Array([9, 0, 0, 0]) });
      await link.request('EVENTS_SET', { mask: EVENT_MASK.WATCH });
      const entries = new Uint8Array([0x00, 0x20, 0x04]);
      expect(await link.request('WATCH_SET', { period_ms: 0, entries })).toMatchObject({ count: 1 });
      const batch = await until(
        () => events,
        (seen) => seen.some((event) => event.name === 'EVT_WATCH'),
        'a watch batch',
      );
      const first = batch.find((event) => event.name === 'EVT_WATCH')!.values as { data: Uint8Array };
      expect([...first.data]).toEqual([9, 0, 0, 0]);
    });
  },
);

describe('the device link over the network rules, every session authenticated (COM-021)', () => {
  itNative('a session needs the key, and a wrong key is not answered (COM-021)', async () => {
    const { link, transport } = await start(['--device-link-network'], { ZPLC_NATIVE_LINK_KEY_HEX: KEY_HEX });
    const hello = await link.hello();
    expect(hello).toMatchObject({ transport: 'NETWORK', keyProvisioned: true });

    // open messages are answered; the rest of it is not, without a session
    expect(await link.request('IDENTITY', {})).toMatchObject({ board: 'native-posix' });
    const unauthenticatedRead = await link.request('STATUS', {}).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((unauthenticatedRead as LinkError).errorName).toBe('AUTH_REQUIRED');
    const unauthenticatedOpen = await link.openSession({}).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((unauthenticatedOpen as LinkError).errorName).toBe('AUTH_REQUIRED');

    // a wrong key is not answered at all
    const wrong = new DeviceLink(transport, { requestTimeoutMs: 400 });
    const rejected = await wrong.openSession({ key: new Uint8Array(32).fill(1) }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).name).toBe('LinkTimeoutError');
    await wrong.close();
  });

  itNative('the right key opens a session; unsigned and wrongly signed frames are dropped, counted and not done (COM-021)', async () => {
    const { link, transport } = await start(['--device-link-network'], { ZPLC_NATIVE_LINK_KEY_HEX: KEY_HEX });
    await link.hello();
    const session = await link.openSession({ key: KEY, name: 'network' });
    expect(session.authenticated).toBe(true);
    await link.request('MEM_WRITE', { address: 0x2040, data: new Uint8Array([1, 2, 3, 4]) });
    expect([...(await link.request('MEM_READ', { address: 0x2040, length: 4 })).data]).toEqual([1, 2, 3, 4]);

    // forged frames, written straight to the pipe, by an attacker who saw the traffic but has no key
    const forged = (sequence: number, key: Uint8Array | null, payload: Uint8Array): Uint8Array => {
      const covered = beginFrame(KIND.REQUEST, MESSAGES.MEM_WRITE.id, sequence, payload, key !== null);
      return finishFrame(covered, key === null ? undefined : new Uint8Array(32));
    };
    const payload = new Uint8Array([0x40, 0x20, 9, 9, 9, 9]);
    transport.write(forged(50, null, payload)); // no code in a session
    transport.write(forged(51, new Uint8Array(32), payload)); // a code that is not the session's
    transport.write(encodeFrame(KIND.REQUEST, MESSAGES.RUN.id, 52)); // a plain frame
    const stats = await link.request('LINK_STATS', {});
    expect(stats.auth_drops).toBeGreaterThanOrEqual(3);
    expect([...(await link.request('MEM_READ', { address: 0x2040, length: 4 })).data]).toEqual([1, 2, 3, 4]);
    expect(await link.request('STATUS', {})).toMatchObject({ state: ENUMS.RUN_STATE.STOPPED });

    // the key is provisioned over the serial link only
    const key = await link.request('KEY_SET', { key: new Uint8Array(32) }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((key as LinkError).errorName).toBe('REFUSED');
    await link.closeSession();
    const after = await link.request('STATUS', {}).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((after as LinkError).errorName).toBe('AUTH_REQUIRED');
    expect(link.has('AUTH')).toBe(true);
    expect(CAPABILITY.AUTH).toBeGreaterThan(0);
    expect(ERROR.AUTH_REQUIRED).toBe(6);
  });
});

describe('signed programs against the real native runtime (COM-026)', () => {
  const SEED = Uint8Array.from({ length: 32 }, (_, index) => 0x80 + index);

  itNative('a device that holds a public key activates only a program signed with the matching private key', async () => {
    const { link } = await start(['--device-link']);
    await link.hello();
    await link.openSession({ name: 'signing' });
    const bytes = program();
    const send = async (signature: Uint8Array | null, content: Uint8Array = bytes) => {
      await link.request('PROGRAM_BEGIN', { size: content.length, crc32: crc32(content) });
      for (let at = 0; at < content.length; at += 64)
        await link.request('PROGRAM_CHUNK', { offset: at, data: content.subarray(at, at + 64) });
      if (signature !== null) await link.request('PROGRAM_SIGN', { signature });
      return link.request('PROGRAM_COMMIT', {});
    };
    const refusal = async (run: () => Promise<unknown>) => {
      const error = await run().then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(LinkError);
      return (error as LinkError).errorName;
    };

    // no key: an unsigned program is accepted
    expect((await send(null)).size).toBe(bytes.length);
    expect(link.has('SIGNATURE')).toBe(true);

    // the key is the serial link's to give, over a session
    await link.request('SIGNING_KEY_SET', { public_key: await publicKeyOf(SEED) });
    expect((await link.hello()).signatureRequired).toBe(true);
    expect(await refusal(() => send(null))).toBe('SIGNATURE_REQUIRED');

    // the transfer is still open: the signature can follow, and the commit goes through
    const signature = await signProgram(SEED, bytes);
    await link.request('PROGRAM_SIGN', { signature });
    expect(await link.request('PROGRAM_COMMIT', {})).toMatchObject({ size: bytes.length, crc32: crc32(bytes) });

    // the signature of another seed, and the signature of this program on another program
    const strangers = await signProgram(Uint8Array.from(SEED).reverse(), bytes);
    expect(await refusal(() => send(strangers))).toBe('SIGNATURE_INVALID');
    const other = new Uint8Array(bytes);
    other[other.length - 1]! ^= 0x01;
    expect(await refusal(() => send(signature, other))).toBe('SIGNATURE_INVALID');

    // the signer a Studio adapter uses is the same function
    expect(await programSignerOf(SEED)(bytes)).toEqual(signature);

    await link.request('SIGNING_KEY_CLEAR', {});
    expect((await link.hello()).signatureRequired).toBe(false);
    expect((await send(null)).size).toBe(bytes.length);
  });
});
