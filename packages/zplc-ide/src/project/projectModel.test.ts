import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '../compiler';
import { parseAndMigrateProject } from './projectModel';

const legacyProject = {
  name: ' Legacy project ',
  version: '1.0.0',
  tasks: [{ name: 'Main', type: 'CYCLIC', interval: 20, priority: 2, file: 'Main.st', watchdog: 50 }],
};

function project(value: unknown) {
  const result = parseAndMigrateProject(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected project');
  return result.project;
}

describe('parseAndMigrateProject', () => {
  it('reports a deterministic, value-free structural preview for known legacy transitions', () => {
    const result = parseAndMigrateProject({
      ...legacyProject,
      communication: { tags: [{ symbol: 'Input.Start' }] },
      tasks: [{ name: 'Main', type: 'CYCLIC', interval: 20, file: 'Main.st', watchdog: 50 }],
    });

    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) throw new Error('expected migration preview');
    expect(result.changes).toEqual([
        { op: 'add', path: '/communication/bindings' },
        { op: 'remove', path: '/communication/tags' },
        { op: 'add', path: '/schemaVersion' },
        { op: 'remove', path: '/tasks/0/file' },
        { op: 'remove', path: '/tasks/0/interval' },
        { op: 'add', path: '/tasks/0/interval_ms' },
        { op: 'add', path: '/tasks/0/priority' },
        { op: 'add', path: '/tasks/0/programs' },
        { op: 'add', path: '/tasks/0/trigger' },
        { op: 'remove', path: '/tasks/0/type' },
        { op: 'remove', path: '/tasks/0/watchdog' },
    ]);
  });

  it('migrates legacy aliases without mutating the input and is idempotent', () => {
    const input = structuredClone(legacyProject);
    const migrated = project(input);

    expect(input).toEqual(legacyProject);
    expect(migrated).toMatchObject({ schemaVersion: 2, name: ' Legacy project ' });
    expect(migrated.tasks[0]).toMatchObject({ trigger: 'cyclic', interval_ms: 20, priority: 2, programs: ['Main.st'] });
    expect(migrated.tasks[0]).not.toHaveProperty('type');
    expect(migrated.tasks[0]).not.toHaveProperty('interval');
    expect(migrated.tasks[0]).not.toHaveProperty('file');
    expect(migrated.tasks[0]).not.toHaveProperty('watchdog');
    expect(migrated.tasks[0]).not.toHaveProperty('watchdog_ms');
    expect(parseAndMigrateProject(migrated)).toMatchObject({ ok: true, changed: false, sourceSchemaVersion: 2 });
  });

  it('keeps compiler output identical for the real multitask demo', () => {
    const base = fileURLToPath(new URL('../../projects/multitask_demo/', import.meta.url));
    const input = JSON.parse(readFileSync(`${base}zplc.json`, 'utf8'));
    const sources = ['FastBlink', 'SlowBlink'].map((name) => ({
      name: `${name}.st`, content: readFileSync(`${base}src/${name}.st`, 'utf8'), language: 'ST' as const,
    }));
    const before = compileMultiTaskProject(input, sources);
    const after = compileMultiTaskProject(project(input), sources);

    expect(after.zplcFile).toEqual(before.zplcFile);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.programDetails.map(({ name, entryPoint }) => ({ name, entryPoint })))
      .toEqual(before.programDetails.map(({ name, entryPoint }) => ({ name, entryPoint })));
  });

  it('rejects unsupported schema versions and malformed task boundaries', () => {
    for (const input of [null, { ...legacyProject, schemaVersion: 3 }, { ...legacyProject, tasks: [{}] }, { ...legacyProject, tasks: [{ name: 'x', programs: ['Main'], interval_ms: 0, priority: 256 }] }]) {
      const result = parseAndMigrateProject(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result).not.toHaveProperty('project');
    }
  });

  it('rejects projects beyond the runtime task capacity without a migration preview', () => {
    const result = parseAndMigrateProject({
      name: 'too-many-tasks',
      version: '1.0.0',
      tasks: Array.from({ length: 17 }, (_, index) => ({ name: `Task${index}`, file: 'Main.st' })),
    });

    expect(result).toEqual({ ok: false, diagnostics: [{ path: 'tasks', message: 'Project exceeds the maximum supported task count' }] });
    expect(result).not.toHaveProperty('changes');
  });

  it('migrates equivalent communication tags but rejects conflicting aliases', () => {
    const equivalent = project({ ...legacyProject, communication: { bindings: [{ symbol: 'A' }], tags: [{ symbol: 'A' }] } });
    expect(equivalent.communication).toEqual({ bindings: [{ symbol: 'A' }] });
    const conflict = parseAndMigrateProject({ ...legacyProject, communication: { bindings: [{ symbol: 'A' }], tags: [{ symbol: 'B' }] } });
    expect(conflict).toMatchObject({ ok: false });
    if (!conflict.ok) expect(conflict.diagnostics).toContainEqual(expect.objectContaining({ path: 'communication.tags' }));
  });

  it('blocks sensitive values without exposing them', () => {
    const secret = 'do-not-log-this-secret';
    const result = parseAndMigrateProject({ ...legacyProject, network: { wifi: { password: secret } } });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result).not.toHaveProperty('changes');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ path: 'network.wifi.password' }));
      expect(result.diagnostics).toHaveLength(1);
      expect(JSON.stringify(result.diagnostics)).not.toContain(secret);
    }
  });

  it('does not mistake non-credential identifiers for secrets', () => {
    expect(parseAndMigrateProject({
      ...legacyProject,
      vendor: { security: 'tls', securityLevel: 'mutual', ssid: 'plant', clientId: 'controller', groupId: 'line-a', azureDpsIdScope: 'scope', azureDpsEndpoint: 'endpoint', lwtPayload: 'offline', description: 'public' },
    })).toMatchObject({ ok: true });
  });

  it('keeps canonical v2 projects unchanged', () => {
    const canonical = project(legacyProject);
    expect(parseAndMigrateProject(canonical)).toMatchObject({ ok: true, changed: false, changes: [], sourceSchemaVersion: 2, project: canonical });
  });

  it('ships every bundled example as canonical v2 without a migration preview', () => {
    const root = fileURLToPath(new URL('../../projects/', import.meta.url));
    for (const name of readdirSync(root)) {
      const input = JSON.parse(readFileSync(`${root}${name}/zplc.json`, 'utf8'));
      expect(parseAndMigrateProject(input)).toMatchObject({ ok: true, sourceSchemaVersion: 2, changed: false, changes: [] });
    }
  });

  it('accepts explicit v1 and SemVer build metadata, then migrates to v2', () => {
    const result = parseAndMigrateProject({ ...legacyProject, schemaVersion: 1, version: '1.0.0-rc-1+build-7' });
    expect(result).toMatchObject({ ok: true, sourceSchemaVersion: 1, changed: true, project: { schemaVersion: 2 } });
    if (!result.ok) throw new Error('expected explicit v1 migration');
    expect(result.changes).toContainEqual({ op: 'replace', path: '/schemaVersion' });
    expect(result.changes).not.toContainEqual({ op: 'add', path: '/schemaVersion' });
  });

  it('removes inert watchdog metadata regardless of its legacy value', () => {
    for (const watchdog_ms of ['10', -1]) {
      const migrated = project({ ...legacyProject, tasks: [{ name: 'main', programs: ['Main'], watchdog_ms }] });
      expect(migrated.tasks[0]).not.toHaveProperty('watchdog_ms');
    }
  });

  it('rejects conflicting task aliases before discarding them', () => {
    const conflicts = [
      [{ name: 'main', programs: ['Main'], interval_ms: 10, interval: 20 }, 'tasks[0].interval'],
      [{ name: 'main', programs: ['Main'], trigger: 'cyclic', type: 'event' }, 'tasks[0].type'],
      [{ name: 'main', programs: ['Main', 'Other'], file: 'Main' }, 'tasks[0].file'],
    ];
    for (const [task, path] of conflicts) {
      const result = parseAndMigrateProject({ ...legacyProject, tasks: [task] });
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.diagnostics).toContainEqual(expect.objectContaining({ path }));
    }
  });

  it('removes canonical and legacy task fields that no longer belong in v2', () => {
    const migrated = project({ ...legacyProject, tasks: [{ name: 'main', programs: ['Main'], file: 'Main', interval_ms: 10, interval: 10, trigger: 'cyclic', type: 'CYCLIC', watchdog_ms: 5, watchdog: 5 }] });
    expect(migrated.tasks[0]).not.toHaveProperty('file');
    expect(migrated.tasks[0]).not.toHaveProperty('interval');
    expect(migrated.tasks[0]).not.toHaveProperty('type');
    expect(migrated.tasks[0]).not.toHaveProperty('watchdog');
    expect(migrated.tasks[0]).not.toHaveProperty('watchdog_ms');
  });

  it('blocks unequivocal credential names but not public identifiers', () => {
    const secrets = ['accessKey', 'secretKey', 'credential', 'credentials', 'bearer', 'psk'];
    for (const key of secrets) expect(parseAndMigrateProject({ ...legacyProject, vendor: { [key]: 'secret' } })).toMatchObject({ ok: false });
    expect(parseAndMigrateProject({ ...legacyProject, vendor: { accessKeyId: 'id', credentialType: 'x', publicCertificatePath: '/public.pem' } })).toMatchObject({ ok: true });
  });

  it('declares the legacy task transition in the shipped schema', () => {
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../zplc.schema.json', import.meta.url)), 'utf8'));
    const task = schema.properties.tasks.items;
    expect(task.required).toEqual(['name']);
    expect(task.anyOf).toEqual([{ required: ['programs'] }, { required: ['file'] }]);
    expect(task.properties).toMatchObject({ file: { type: 'string' }, interval: { type: 'integer', minimum: 1 }, type: { type: 'string' } });
    expect(task.properties).not.toHaveProperty('watchdog');
    expect(task.properties).not.toHaveProperty('watchdog_ms');
  });

  it('keeps the shipped Wi-Fi and MQTT schemas aligned with the parser’s credential boundary', () => {
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../zplc.schema.json', import.meta.url)), 'utf8'));
    const wifi = schema.definitions.wifiNetworkConfig;
    const mqtt = schema.definitions.mqttConfig;
    const forbidden = ['password', 'clientKeyPath', 'azureSasKey', 'awsClaimKeyPath'];

    expect(wifi.additionalProperties).toBe(false);
    expect(mqtt.additionalProperties).toBe(false);
    for (const key of forbidden) {
      expect(wifi.properties).not.toHaveProperty(key);
      expect(mqtt.properties).not.toHaveProperty(key);
      const result = parseAndMigrateProject({
        ...legacyProject,
        ...(key === 'password'
          ? { network: { wifi: { enabled: true, security: 'wpa2-psk', hiddenSsid: false, ipv4: { dhcp: true }, [key]: 'secret' } } }
          : { communication: { mqtt: { enabled: false, profile: 'generic-broker', protocolVersion: '5.0', transport: 'tls', broker: 'broker.example', port: 8883, clientId: 'controller', keepAliveSec: 60, cleanSession: true, sessionExpirySec: 0, topicNamespace: 'plant', publishIntervalMs: 1000, publishQos: 0, subscribeQos: 0, publishRetain: false, lwtEnabled: false, lwtQos: 0, lwtRetain: false, securityLevel: 'tls-server-verify', [key]: 'secret' } } }),
      });
      expect(result).toMatchObject({ ok: false });
    }

    expect(parseAndMigrateProject({
      ...legacyProject,
      communication: { mqtt: { enabled: false, profile: 'generic-broker', protocolVersion: '5.0', transport: 'tls', broker: 'broker.example', port: 8883, clientId: 'controller', keepAliveSec: 60, cleanSession: true, sessionExpirySec: 0, username: 'operator', topicNamespace: 'plant', publishIntervalMs: 1000, publishQos: 0, subscribeQos: 0, publishRetain: false, lwtEnabled: false, lwtQos: 0, lwtRetain: false, securityLevel: 'tls-server-verify', caCertPath: 'certificates/ca.pem', clientCertPath: 'certificates/public.pem' } },
    })).toMatchObject({ ok: true });

    const canonical = JSON.parse(readFileSync(fileURLToPath(new URL('../../projects/pico_blinky/zplc.json', import.meta.url)), 'utf8'));
    for (const key of Object.keys(canonical.communication.mqtt)) expect(mqtt.properties).toHaveProperty(key);
  });

  it('accepts all versioned project fixtures', () => {
    const projects = fileURLToPath(new URL('../../projects/', import.meta.url));
    for (const projectName of readdirSync(projects)) {
      const result = parseAndMigrateProject(JSON.parse(readFileSync(`${projects}${projectName}/zplc.json`, 'utf8')));
      expect(result.ok, projectName).toBe(true);
    }
  });

  it('accepts bounded incompatible output pairs and rejects malformed safety declarations', () => {
    const valid = project({ ...legacyProject, safety: { incompatibleOutputs: [['Motor.Forward', 'Motor.Reverse']] } });
    expect(valid.safety).toEqual({ incompatibleOutputs: [['Motor.Forward', 'Motor.Reverse']] });
    expect(parseAndMigrateProject(legacyProject)).toMatchObject({ ok: true });
    for (const safety of [
      {},
      { incompatibleOutputs: [] },
      { incompatibleOutputs: [['Motor.Forward']] },
      { incompatibleOutputs: [['Motor.Forward', 'Motor.Forward']] },
      { incompatibleOutputs: [['Motor.Forward', 'Motor.Reverse'], ['Motor.Reverse', 'Motor.Forward']] },
      { incompatibleOutputs: [['', 'Motor.Reverse']] },
      { incompatibleOutputs: [['Motor.Forward', 'Motor.Reverse']], extra: true },
    ]) expect(parseAndMigrateProject({ ...legacyProject, safety })).toMatchObject({ ok: false });
  });
});
