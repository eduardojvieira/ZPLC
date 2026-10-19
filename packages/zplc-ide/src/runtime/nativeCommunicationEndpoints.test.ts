import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../package.json';
import { nativeSimulationEnvironment } from '../../electron/nativeSimulationEnvironment';
import { NativeSimulationSupervisor } from '../../electron/nativeSimulationSupervisor';
import { nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { cellLocation } from '../conformance/cases';
import { NativeAdapter } from './nativeAdapter';

// COM-009: the session that Studio starts gives the program a Modbus server and an MQTT broker of their own, and the
// program names neither a port nor a broker. The environment is the one Studio builds (nativeSimulationEnvironment);
// the runtime is the native one. This is evidence against protocol doubles on 127.0.0.1, not against a plant.

const found = existsSync(nativeRuntimeBinary);
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');
const itSimulated = (found || !inCi
  ? it.skipIf(!found)
  : (name: string) => it(name, () => { throw new Error(`zplc_runtime not found (${nativeRuntimeBinary}); CI is set`); })) as ReturnType<typeof it.skipIf>;

const PROGRAM = `PROGRAM Demo
VAR
  Wr : MB_WRITE_HREG;
  Rd : MB_READ_HREG;
  Con : MQTT_CONNECT;
  Pub : MQTT_PUBLISH;
  Dps : AZURE_DPS_PROV;
  Value AT %QW0 : UINT;
  Read AT %QX2.1 : BOOL;
  Published AT %QX2.3 : BOOL;
  Cloud AT %QD1 : DINT;
END_VAR
  Wr(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 8, COUNT := 1, VALUE := 51966, HOST := 'plc.factory.example', PORT := 502);
  Rd(EN := Wr.DONE, PROTO := 1, SLAVE_ID := 1, ADDR := 8, COUNT := 1, HOST := 'plc.factory.example', PORT := 502);
  Value := Rd.VALUE;
  Read := Rd.DONE;
  Con(EN := TRUE);
  Pub(EN := Con.DONE, QOS := 0, RETAIN := FALSE, TOPIC := 'sim/out', PAYLOAD := 'ping');
  Published := Pub.DONE;
  Dps(EN := TRUE);
  Cloud := Dps.STATUS;
END_PROGRAM
`;

const STATUS_UNAVAILABLE = 10;

describe('COM-009 the endpoints that the Studio session starts', () => {
  itSimulated('a program meets a Modbus server and a broker with no address of theirs, and a cloud block says it is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-endpoints-'));
    const persist = await mkdtemp(join(tmpdir(), 'zplc-endpoints-run-'));
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.st'), PROGRAM);
    await writeFile(join(root, 'zplc.json'), JSON.stringify({
      schemaVersion: 2, name: 'endpoints', version: '1.0.0', target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
    }));
    const environment = {
      ...nativeSimulationEnvironment({ ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist }, true, '/unused'),
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
    };
    const supervisor = new NativeSimulationSupervisor({ clientName: 'zplc-endpoints-test', clientVersion: productManifest.version, environment });
    const adapter = new NativeAdapter(supervisor);
    const console: string[] = [];
    adapter.setEventHandlers({ onSerialData: (line) => console.push(line) });
    try {
      const compiled = await compilerCompile(root);
      if (!compiled.ok || !compiled.zplcFile) throw new Error(`the program does not build: ${JSON.stringify(compiled.evidence.diagnostics)}`);
      await adapter.connect();
      expect(console.join('\n')).toMatch(/endpoints on 127\.0\.0\.1/);
      await adapter.loadProgram(compiled.zplcFile);
      const read = async (at: string, type: 'UINT' | 'BOOL' | 'DINT') => {
        const where = cellLocation(at, type);
        const bytes = await adapter.peek(where.address, where.size);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (type === 'BOOL') return (bytes[0]! & (1 << (where.bit ?? 0))) !== 0 ? 1 : 0;
        return type === 'UINT' ? view.getUint16(0, true) : view.getInt32(0, true);
      };
      let seen = { value: 0, read: 0, published: 0, cloud: 0 };
      for (let scan = 1; scan <= 1500; scan += 1) {
        await adapter.scenarioStep((scan - 1) * 10);
        seen = { value: await read('%QW0', 'UINT'), read: await read('%QX2.1', 'BOOL'), published: await read('%QX2.3', 'BOOL'), cloud: await read('%QD1', 'DINT') };
        if (seen.read === 1 && seen.published === 1) break;
        await Bun.sleep(4);
      }
      expect(seen.read).toBe(1);
      expect(seen.value).toBe(0xcafe);
      expect(seen.published).toBe(1);
      expect(seen.cloud).toBe(STATUS_UNAVAILABLE);
    } finally {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
      await rm(persist, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
