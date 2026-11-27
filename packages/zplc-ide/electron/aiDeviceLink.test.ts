// COM-030, the AI path: nothing a request to the AI provider can carry names a device link.
//
// The renderer is not trusted with the shape of a provider request: isAllowedAiProviderRequest takes exactly
// six fields and refuses everything else, and the provider module is bundled below to show that what answers
// the request cannot open a port or a socket of its own either.
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { isAllowedAiProviderRequest } from './security';

const workspaceId = '0f2ce877-e0d6-43ca-89a7-df17a4927f51';

const VALID = {
  ask: { workspaceId, mode: 'ask', prompt: 'Explain this' },
  plan: { workspaceId, mode: 'plan', prompt: 'Plan this' },
  edit: { workspaceId, mode: 'edit', prompt: 'Fix', activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' } },
  // the open program of any language goes with a request in every mode (S4), and carries no more than its identity
  askWithProgram: {
    workspaceId,
    mode: 'ask',
    prompt: 'Explain',
    activeFile: { fileId: 'file:src/Lamp.ld.json', path: 'src/Lamp.ld.json' },
  },
  debug: {
    workspaceId,
    mode: 'debug',
    prompt: 'Why?',
    diagnostics: [{ code: 'E_TEST', path: 'src/Main.st', line: 1 }],
    trace: [{ atMs: 1, signal: 'Q.Motor', value: true }],
  },
} as const;

describe('COM-030: no AI request can carry a device link', () => {
  test('the four modes are accepted as they are', () => {
    for (const [mode, request] of Object.entries(VALID)) expect(isAllowedAiProviderRequest(request), mode).toBe(true);
  });

  test('a field that names a port, a device, a session or a physical action is refused in every mode', () => {
    const fields = [
      'port',
      'serialPort',
      'portId',
      'path',
      'device',
      'deviceId',
      'baud',
      'baudRate',
      'host',
      'address',
      'url',
      'endpoint',
      'connect',
      'session',
      'runtime',
      'adapter',
      'transport',
      'command',
      'shell',
      'tool',
      'tools',
      'action',
      'deploy',
      'flash',
      'upload',
      'run',
      'start',
      'stop',
      'force',
      'write',
      'poke',
      'peek',
      'raw',
    ];
    for (const [mode, request] of Object.entries(VALID)) {
      for (const field of fields) {
        expect(isAllowedAiProviderRequest({ ...request, [field]: 'x' }), `${mode} accepted '${field}'`).toBe(false);
        expect(
          isAllowedAiProviderRequest({ ...request, [field]: { port: '/dev/ttyUSB0' } }),
          `${mode} accepted '${field}' as an object`,
        ).toBe(false);
      }
    }
  });

  test('a diagnostic or a trace sample cannot smuggle a field either', () => {
    expect(isAllowedAiProviderRequest({ ...VALID.debug, diagnostics: [{ code: 'E_TEST', port: '/dev/ttyUSB0' }] })).toBe(false);
    expect(isAllowedAiProviderRequest({ ...VALID.debug, trace: [{ atMs: 1, signal: 'Q.Motor', value: true, device: 'x' }] })).toBe(false);
    expect(isAllowedAiProviderRequest({ ...VALID.edit, activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st', port: 'x' } })).toBe(
      false,
    );
  });

  test('the module that answers the request is bundled without a serial, upload or socket module', async () => {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'aiProvider.ts')],
      target: 'bun',
      minify: false,
      metafile: true,
    } as never);
    expect(built.success).toBe(true);
    const metafile = (built as unknown as { metafile: { inputs: Record<string, { imports: Array<{ path: string }> }> } }).metafile;
    const modules = Object.keys(metafile.inputs);
    expect(
      modules.filter((path) =>
        /serialAdapter|serialConsole|connectionManager|deviceHandshake|uploadProtocol|uploader\/|serialPort|electron\/main/.test(path),
      ),
    ).toEqual([]);
    const external = new Set<string>();
    for (const input of Object.values(metafile.inputs))
      for (const edge of input.imports)
        if (!edge.path.startsWith('.') && !edge.path.startsWith('/')) external.add(edge.path.replace(/^node:/, ''));
    for (const forbidden of ['net', 'dgram', 'tls', 'serialport', '@serialport/bindings-cpp', 'usb', 'child_process']) {
      expect(external.has(forbidden), `the AI provider imports '${forbidden}'`).toBe(false);
    }
    const text = await built.outputs[0]!.text();
    for (const primitive of ['navigator.serial', 'requestPort', 'SerialPort', 'serialport'])
      expect(text.includes(primitive), primitive).toBe(false);
  });
});


describe('AIX-001: the structured context a request may carry', () => {
  const failedScenarios = [
    { id: 'Belt', assertions: [{ index: 0, kind: 'at', atMs: 10, checks: [{ signal: 'Belt.Run', expected: true, observed: false }] }] },
  ];
  const rich = {
    ...VALID.ask,
    diagnostics: [{ code: 'E_TYPE', message: 'Type mismatch', path: 'src/Main.st', line: 3, column: 2, element: 'rung:r1' }],
    failedScenarios,
    facts: { 'fact:itemsDropped': 2, 'fact:lit': true },
    selection: { startLine: 1, endLine: 2, text: 'Run := TRUE;' },
    lessonContext: { lessonId: 'ld-no-nc-contacts', stage: 'edit' },
    locale: 'es',
  };

  test('accepts every field of the context, in every mode but a trace outside debug', () => {
    for (const mode of ['ask', 'plan', 'edit', 'debug'])
      expect(isAllowedAiProviderRequest({ ...rich, mode, activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' } }), mode).toBe(true);
    expect(isAllowedAiProviderRequest({ ...rich, selection: { element: 'block:b2' } })).toBe(true);
    expect(isAllowedAiProviderRequest({ ...rich, lessonContext: { lessonId: 'ld-no-nc-contacts' } })).toBe(true);
    expect(isAllowedAiProviderRequest({ ...VALID.ask, trace: [{ atMs: 1, signal: 'Q.Motor', value: true }] })).toBe(false);
  });

  test('refuses what exceeds a bound: 256 characters of a message, 4 scenarios, 8 assertions, 8 checks, 32 facts', () => {
    const base = failedScenarios[0]!;
    const check = base.assertions[0]!.checks[0]!;
    const refused: Array<[string, unknown]> = [
      ['message', { diagnostics: [{ code: 'E_TYPE', message: 'm'.repeat(257) }] }],
      ['scenarios', { failedScenarios: Array.from({ length: 5 }, () => base) }],
      ['assertions', { failedScenarios: [{ id: 'B', assertions: Array.from({ length: 9 }, () => base.assertions[0]) }] }],
      ['checks', { failedScenarios: [{ id: 'B', assertions: [{ ...base.assertions[0], checks: Array.from({ length: 9 }, () => check) }] }] }],
      ['facts', { facts: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`fact:f${i}`, 1])) }],
      ['selection', { selection: { startLine: 1, endLine: 1, text: 'x'.repeat(4097) } }],
    ];
    for (const [name, extra] of refused) expect(isAllowedAiProviderRequest({ ...VALID.ask, ...(extra as object) }), name).toBe(false);
  });

  test('refuses a locale, an element, a lesson id and a fact name that are not of the closed forms', () => {
    const refused: Array<[string, object]> = [
      ['locale', { locale: 'fr' }],
      ['element', { diagnostics: [{ code: 'E_TYPE', message: 'm', element: '../../etc' }] }],
      ['selection element', { selection: { element: 'file:/etc/passwd' } }],
      ['lesson id', { lessonContext: { lessonId: '../learn' } }],
      ['fact name', { facts: { 'Main.Run': true } }],
      ['fact value', { facts: { 'fact:x': 'on' } }],
      ['selection order', { selection: { startLine: 5, endLine: 2, text: 'x' } }],
    ];
    for (const [name, extra] of refused) expect(isAllowedAiProviderRequest({ ...VALID.ask, ...extra }), name).toBe(false);
  });

  test('the classroom setting and every device or port key stay refused, also inside the new fields', () => {
    for (const field of ['solutionsHidden', 'hideSolutions', 'endpoint', 'port', 'session'])
      expect(isAllowedAiProviderRequest({ ...rich, [field]: false }), field).toBe(false);
    expect(isAllowedAiProviderRequest({ ...rich, selection: { startLine: 1, endLine: 1, text: 'x', port: '/dev/ttyUSB0' } })).toBe(false);
    expect(isAllowedAiProviderRequest({ ...rich, lessonContext: { lessonId: 'ld-no-nc-contacts', solutionsHidden: false } })).toBe(false);
    expect(isAllowedAiProviderRequest({ ...rich, failedScenarios: [{ ...failedScenarios[0], device: 'x' }] })).toBe(false);
    expect(isAllowedAiProviderRequest({ ...rich, diagnostics: [{ code: 'E_TYPE', message: 'm', port: '/dev/ttyUSB0' }] })).toBe(false);
  });

  test('the channel of the connection test takes no argument and no endpoint', async () => {
    const { isAllowedAiProviderConfig } = await import('./security');
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'http://localhost:11434', model: 'llama3' })).toBe(true);
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'http://localhost.evil.test', model: 'llama3' })).toBe(false);
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'http://127.0.0.2', model: 'llama3' })).toBe(false);
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'https://api.openai.com', model: 'gpt' })).toBe(true);
  });
});
