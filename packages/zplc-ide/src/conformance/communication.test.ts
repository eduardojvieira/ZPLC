import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { cellLocation } from './cases';

// COM-009: the Modbus and MQTT blocks of a program work in simulation, against loopback endpoints that a session
// starts itself and ends with itself. The runtime is the native POSIX runtime that Studio drives, started with
// ZPLC_NATIVE_COMM=1; the peers are the zplc_loopback program on 127.0.0.1. A program writes a register and reads
// it back, joins the broker, publishes, and receives a message; a block of a cloud service answers "not
// available". Without ZPLC_NATIVE_COMM the same program is answered "no handler", as it always was.

const loopbackBinary = process.env.ZPLC_LOOPBACK_BIN ?? join(dirname(nativeRuntimeBinary), 'zplc_loopback');
const found = existsSync(nativeRuntimeBinary) && existsSync(loopbackBinary);
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');
const itSimulated = (
  found || !inCi
    ? it.skipIf(!found)
    : (name: string) =>
        it(name, () => {
          throw new Error(`zplc_runtime or zplc_loopback not found (${nativeRuntimeBinary}, ${loopbackBinary}); CI is set`);
        })
) as ReturnType<typeof it.skipIf>;

const REGISTER_VALUE = 0xcafe;
const STATUS_NO_HANDLER = 3;
const STATUS_UNAVAILABLE = 10;

function program(modbusPort: number): string {
  return `PROGRAM Demo
VAR
  Wr : MB_WRITE_HREG;
  Rd : MB_READ_HREG;
  Con : MQTT_CONNECT;
  Pub : MQTT_PUBLISH;
  Sub : MQTT_SUBSCRIBE;
  Dps : AZURE_DPS_PROV;
  Value AT %QW0 : UINT;
  Wrote AT %QX2.0 : BOOL;
  Read AT %QX2.1 : BOOL;
  Joined AT %QX2.2 : BOOL;
  Published AT %QX2.3 : BOOL;
  Got AT %QX2.4 : BOOL;
  Cloud AT %QD1 : DINT;
  GotLen AT %QW4 : INT;
END_VAR
  Wr(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 8, COUNT := 1, VALUE := ${REGISTER_VALUE}, HOST := '127.0.0.1', PORT := ${modbusPort});
  Rd(EN := Wr.DONE, PROTO := 1, SLAVE_ID := 1, ADDR := 8, COUNT := 1, HOST := '127.0.0.1', PORT := ${modbusPort});
  Value := Rd.VALUE;
  Wrote := Wr.DONE;
  Read := Rd.DONE;
  Con(EN := TRUE);
  Joined := Con.DONE;
  Pub(EN := Con.DONE, QOS := 0, RETAIN := FALSE, TOPIC := 'sim/out', PAYLOAD := 'ping');
  Published := Pub.DONE;
  Sub(EN := Con.DONE, QOS := 0, TOPIC := 'sim/in');
  IF Sub.VALID THEN
    Got := TRUE;
    GotLen := LEN(Sub.PAYLOAD);
  END_IF;
  Dps(EN := TRUE);
  Cloud := Dps.STATUS;
END_PROGRAM
`;
}

type Loopback = { modbus: number; mqtt: number; child: ChildProcessWithoutNullStreams };

async function startLoopback(): Promise<Loopback> {
  const child = spawn(loopbackBinary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const ports = await new Promise<{ modbus: number; mqtt: number }>((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('zplc_loopback did not report its ports')), 5000);
    child.stdout.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      const line = text.split('\n')[0];
      if (text.includes('\n') && line) {
        clearTimeout(timer);
        resolve(JSON.parse(line) as { modbus: number; mqtt: number });
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`zplc_loopback exited with ${code}`)));
  });
  return { ...ports, child };
}

// A client of the broker that the test owns: it listens to what the program publishes and publishes what the
// program subscribes to. Plain MQTT 3.1.1, QoS 0.
function mqttString(text: string): Buffer {
  const body = Buffer.from(text);
  return Buffer.concat([Buffer.from([body.length >> 8, body.length & 0xff]), body]);
}

function mqttPacket(first: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([first, body.length]), body]);
}

class Watcher {
  readonly messages: Array<{ topic: string; payload: string }> = [];
  private readonly socket: Socket;
  private pending = Buffer.alloc(0);

  constructor(port: number) {
    this.socket = connect(port, '127.0.0.1');
    this.socket.on('data', (chunk) => this.feed(chunk));
    this.socket.on('error', () => undefined);
  }

  start(): void {
    this.socket.write(mqttPacket(0x10, Buffer.concat([mqttString('MQTT'), Buffer.from([4, 2, 0, 30]), mqttString('test-watcher')])));
    this.socket.write(mqttPacket(0x82, Buffer.concat([Buffer.from([0, 1]), mqttString('sim/out'), Buffer.from([0])])));
  }

  publish(topic: string, payload: string): void {
    this.socket.write(mqttPacket(0x30, Buffer.concat([mqttString(topic), Buffer.from(payload)])));
  }

  close(): void {
    this.socket.destroy();
  }

  private feed(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 2) {
      const length = this.pending[1]!;
      if (this.pending.length < 2 + length) return;
      const packet = this.pending.subarray(0, 2 + length);
      this.pending = this.pending.subarray(2 + length);
      if (packet[0]! >> 4 === 3) {
        const topicLength = (packet[2]! << 8) | packet[3]!;
        this.messages.push({
          topic: packet.subarray(4, 4 + topicLength).toString(),
          payload: packet.subarray(4 + topicLength).toString(),
        });
      }
    }
  }
}

type Observed = {
  value: number;
  wrote: boolean;
  read: boolean;
  joined: boolean;
  published: boolean;
  got: boolean;
  cloud: number;
  gotLength: number;
};

async function runProgram(env: Record<string, string>, until: (observed: Observed) => boolean, onScan?: () => void): Promise<Observed> {
  const modbusPort = Number(env.ZPLC_TEST_MODBUS_PORT);
  const root = await mkdtemp(join(tmpdir(), 'zplc-comm-'));
  const persist = await mkdtemp(join(tmpdir(), 'zplc-comm-run-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'main.st'), program(modbusPort));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'comm',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
    }),
  );
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-communication-test',
    clientVersion: productManifest.version,
    environment: {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary,
      ZPLC_PERSIST_ROOT: persist,
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
      ...env,
    },
  });
  const adapter = new NativeAdapter(supervisor);
  try {
    const compiled = await compilerCompile(root);
    if (!compiled.ok || !compiled.zplcFile) throw new Error(`the program does not build: ${JSON.stringify(compiled.evidence.diagnostics)}`);
    await adapter.connect();
    await adapter.loadProgram(compiled.zplcFile);
    const read = async (at: string, type: 'UINT' | 'BOOL' | 'DINT' | 'INT') => {
      const where = cellLocation(at, type);
      const bytes = await adapter.peek(where.address, where.size);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (type === 'BOOL') return (bytes[0]! & (1 << (where.bit ?? 0))) !== 0 ? 1 : 0;
      return type === 'UINT' ? view.getUint16(0, true) : type === 'INT' ? view.getInt16(0, true) : view.getInt32(0, true);
    };
    let observed: Observed | undefined;
    // the clock of a session is virtual and the network is not: a scan every few milliseconds of real time
    for (let scan = 1; scan <= 1500; scan += 1) {
      await adapter.scenarioStep((scan - 1) * 10);
      onScan?.();
      observed = {
        value: await read('%QW0', 'UINT'),
        wrote: (await read('%QX2.0', 'BOOL')) === 1,
        read: (await read('%QX2.1', 'BOOL')) === 1,
        joined: (await read('%QX2.2', 'BOOL')) === 1,
        published: (await read('%QX2.3', 'BOOL')) === 1,
        got: (await read('%QX2.4', 'BOOL')) === 1,
        cloud: await read('%QD1', 'DINT'),
        gotLength: await read('%QW4', 'INT'),
      };
      if (until(observed)) return observed;
      await Bun.sleep(4);
    }
    return observed!;
  } finally {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
}

describe('COM-009 the communication blocks in simulation', () => {
  let loopback: Loopback | undefined;

  beforeAll(async () => {
    if (found) loopback = await startLoopback();
  });

  afterAll(() => {
    loopback?.child.stdin.end();
  });

  itSimulated(
    'a program writes and reads a register, publishes, receives a message and meets a service it does not have',
    async () => {
      const endpoints = loopback!;
      const watcher = new Watcher(endpoints.mqtt);
      watcher.start();
      let announced = 0;
      try {
        const observed = await runProgram(
          {
            ZPLC_NATIVE_COMM: '1',
            ZPLC_NATIVE_MQTT_BROKER: `127.0.0.1:${endpoints.mqtt}`,
            ZPLC_TEST_MODBUS_PORT: String(endpoints.modbus),
          },
          (state) => state.read && state.published && state.got && watcher.messages.some((message) => message.topic === 'sim/out'),
          () => {
            // the program subscribes once it has joined; a message sent before that is dropped, so it is sent until seen
            announced += 1;
            if (announced % 8 === 0) watcher.publish('sim/in', 'hello');
          },
        );
        expect(observed.wrote).toBe(true);
        expect(observed.read).toBe(true);
        expect(observed.value).toBe(REGISTER_VALUE);
        expect(observed.joined).toBe(true);
        expect(observed.published).toBe(true);
        expect(watcher.messages.find((message) => message.topic === 'sim/out')?.payload).toBe('ping');
        expect(observed.got).toBe(true);
        expect(observed.gotLength).toBe(5);
        expect(observed.cloud).toBe(STATUS_UNAVAILABLE);
      } finally {
        watcher.close();
      }
    },
    60_000,
  );

  itSimulated(
    'a session started without ZPLC_NATIVE_COMM answers "no handler", as it always did',
    async () => {
      const endpoints = loopback!;
      const observed = await runProgram(
        { ZPLC_NATIVE_COMM: '', ZPLC_TEST_MODBUS_PORT: String(endpoints.modbus) },
        (state) => state.cloud === STATUS_NO_HANDLER,
      );
      expect(observed.cloud).toBe(STATUS_NO_HANDLER);
      expect(observed.wrote).toBe(false);
      expect(observed.joined).toBe(false);
    },
    30_000,
  );
});
