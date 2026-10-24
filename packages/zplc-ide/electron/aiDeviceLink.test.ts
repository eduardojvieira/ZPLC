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
