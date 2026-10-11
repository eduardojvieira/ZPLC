import { describe, expect, it } from 'bun:test';

import { EventRouter } from './eventRouter';
import { describeFirmware } from './firmwareProtocol';
import { CAPABILITY } from './protocol.generated';
import { ShellLineTransport, bytesToLowerHex, hexToBytes, type ShellConsole } from './shellTransport';
import type { HelloInfo } from './deviceLink';

const hello = (overrides: Partial<HelloInfo> = {}): HelloInfo => ({
  version: 1, transport: 'SERIAL', maxPayload: 512, sessionState: 'NONE', keyProvisioned: false, idleTimeoutS: 30,
  capabilities: CAPABILITY.SESSION | CAPABILITY.MEMORY | CAPABILITY.EVENTS | CAPABILITY.PROGRAM, ...overrides,
});

describe('which firmware this is (COM-029)', () => {
  it('a firmware that answers the hello speaks the link, and says what it gives', () => {
    const report = describeFirmware({ studioVersion: '2.0.0', hello: hello(), systemInfo: { zplc_version: '2.0.0', device_protocol_version: 1 } });
    expect(report.protocol).toMatchObject({ kind: 'framed', version: 1 });
    expect(report.features).toEqual({ sessions: true, atomicWrite: true, events: true, checkedDownload: true });
    expect(report.action).toBe('use-link');
    expect(report.message).not.toContain('install');
  });

  it('a firmware of another release is named with both versions', () => {
    const report = describeFirmware({ studioVersion: '2.1.0', hello: hello(), systemInfo: { zplc_version: '2.0.0', device_protocol_version: 1 } });
    expect(report.message).toContain('version 2.0.0');
    expect(report.message).toContain('2.1.0');
  });

  it('a firmware that answers only the shell is the older protocol: what is missing, and which firmware to install', () => {
    const report = describeFirmware({ studioVersion: '2.0.0-rc.3', hello: null, systemInfo: { zplc_version: '1.5.0', device_protocol_version: 1 } });
    expect(report.protocol).toEqual({ kind: 'shell-only', shellProtocolVersion: 1 });
    expect(report.features).toEqual({ sessions: false, atomicWrite: false, events: false, checkedDownload: false });
    expect(report.action).toBe('use-shell-and-offer-update');
    expect(report.firmwareVersion).toBe('1.5.0');
    expect(report.message).toContain('older text shell protocol');
    expect(report.message).toContain('Install the firmware of release 2.0.0-rc.3');
    expect(report.message).toContain('one byte at a time');
  });

  it('a device that answers neither is not talked to', () => {
    const report = describeFirmware({ studioVersion: '2.0.0', hello: null, systemInfo: null });
    expect(report).toMatchObject({ protocol: { kind: 'unknown' }, action: 'cannot-talk' });
  });
});

describe('the frames of the shell lines', () => {
  const console_ = (): { shell: ShellConsole; written: string[]; feed: (text: string) => void } => {
    const written: string[] = [];
    const handlers = new Set<(chunk: string) => void>();
    return {
      written,
      shell: { writeText: async (text) => { written.push(text); }, onText: (handler) => { handlers.add(handler); return () => handlers.delete(handler); } },
      feed: (text) => handlers.forEach((handler) => handler(text)),
    };
  };

  it('writes one frame as one command and reads frames out of lines, whatever is printed around them', () => {
    const c = console_();
    const transport = new ShellLineTransport(c.shell);
    const received: string[] = [];
    transport.onData((bytes) => received.push(bytesToLowerHex(bytes)));
    void transport.write(new Uint8Array([0x5a, 0xa5, 0x01]));
    expect(c.written).toEqual(['zplc link 5aa501\r\n']);
    c.feed('zplc link 5aa501\r\n');
    c.feed('\x1b[1;32mzplc:~$ \x1b[m\nZF:5aa5');
    c.feed('0102\n"stats":{}\nZF:ff00\n');
    expect(received).toEqual(['5aa50102', 'ff00']);
  });

  it('takes the lines of frames out of a text', () => {
    const text = '{"state":"idle",\nZF:5aa501\n"stats":{"cycles":1}}\nOK: done\nzplc:~$ ZF:aa55\n';
    expect(ShellLineTransport.withoutFrames(text)).toBe('{"state":"idle",\n"stats":{"cycles":1}}\nOK: done\n');
    expect(hexToBytes('5aa5')).toEqual(new Uint8Array([0x5a, 0xa5]));
  });
});

describe('one router for what the device reports (COM-025)', () => {
  it('delivers in order, once, to every subscriber', async () => {
    const router = new EventRouter<number>();
    const a: number[] = [];
    const b: number[] = [];
    router.subscribe((event) => a.push(event));
    router.subscribe((event) => b.push(event));
    router.push(1);
    router.push(2);
    await Promise.resolve();
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
    expect(router.status()).toMatchObject({ delivered: 2, dropped: 0 });
  });

  it('is bounded: the oldest event goes first and the loss is counted', async () => {
    const router = new EventRouter<number>({ capacity: 3 });
    const seen: number[] = [];
    router.subscribe((event) => seen.push(event));
    for (let value = 1; value <= 10; value++) router.push(value);
    await Promise.resolve();
    expect(seen).toEqual([8, 9, 10]);
    expect(router.status()).toMatchObject({ delivered: 3, dropped: 7 });
    router.noteLostByDevice(5);
    expect(router.status().lostByDevice).toBe(5);
  });

  it('says how the state is known: pushed, or polled and how often', async () => {
    const router = new EventRouter<string>({ pollIntervalMs: 5 });
    expect(router.status()).toMatchObject({ source: 'none', label: 'no device' });
    router.useEvents();
    expect(router.status()).toMatchObject({ source: 'events', label: 'state pushed by the device' });
    let polls = 0;
    const seen: string[] = [];
    router.subscribe((event) => seen.push(event));
    router.usePolling(async () => { polls++; return `poll ${polls}`; });
    expect(router.status().label).toBe('state polled every 5 ms: this firmware does not push events');
    await new Promise((resolve) => setTimeout(resolve, 40));
    router.stop();
    const count = seen.length;
    expect(count).toBeGreaterThan(2);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen.length).toBe(count);
    expect(router.status().source).toBe('none');
  });
});
