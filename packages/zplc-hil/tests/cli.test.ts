import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { main } from '../src/cli';
import type { CliDeps } from '../src/cli';
import type { HumanIo } from '../src/guard';
import { HostRuntimeLink } from '../src/hostLink';
import { validate } from '../src/record';
import { FakeLink } from './fakeLink';
import { itNative, nativeRuntime } from './nativeGuard';

const ROOT = new URL('../../../', import.meta.url).pathname;
const WORKSPACE = join(ROOT, 'packages/zplc-ide/projects/motor_start_stop');
const SCENARIO = join(WORKSPACE, 'tests/motor-start-stop.scenario.json');

function person(answers: string[], interactive = true): HumanIo & { said: string[] } {
  const said: string[] = [];
  return { interactive, said, say: (text) => { said.push(text); }, ask: (prompt) => { said.push(prompt); return Promise.resolve(answers.shift() ?? ''); } };
}

function deps(io: HumanIo, extra: Partial<CliDeps> = {}): CliDeps & { errors: string[] } {
  const errors: string[] = [];
  return { io, stderr: (text) => { errors.push(text); }, env: {}, errors, ...extra };
}

const RUN = ['run', '--board', 'rpi_pico', '--workspace', WORKSPACE, '--scenario', SCENARIO];

describe('the hardware scenario command (HIL-003)', () => {
  test('without an interactive terminal it exits 2 with the reason, and opens nothing', async () => {
    let opened = false;
    const context = deps(person([], false), { openLink: () => { opened = true; return Promise.resolve(new FakeLink()); } });
    expect(await main(RUN, context)).toBe(2);
    expect(context.errors.join('\n')).toContain('interactive terminal');
    expect(opened).toBe(false);
  });

  test('a missing argument, an unknown one and a link it does not know are usage errors', async () => {
    expect(await main(['run', '--board', 'rpi_pico'], deps(person([])))).toBe(2);
    expect(await main([...RUN, '--yes-i-am-at-the-bench'], deps(person([])))).toBe(2);
    expect(await main([...RUN, '--link', 'wifi'], deps(person([])))).toBe(2);
  });

  test('the person must type what the device reports before anything runs, and the link is closed when they do not', async () => {
    const link = new FakeLink();
    const context = deps(person(['Ana', 'rpi_pico', 'rpi_pico']), { openLink: () => Promise.resolve(link) });
    expect(await main(RUN, context)).toBe(2);
    expect(context.errors.join('\n')).toContain('was not confirmed');
    expect(link.calls).not.toContain('start');
    expect(link.calls).toContain('close');
  });

  itNative('a person who confirms both physical steps runs the scenario, and the record names the typed identity and is valid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zplc-hil-cli-'));
    const io = person(['Ana', 'native_posix', 'native_posix']);
    try {
      const link = await HostRuntimeLink.open(nativeRuntime);
      const context = deps(io, { openLink: () => Promise.resolve(link), env: { ZPLC_NATIVE_SIM_BIN: nativeRuntime } });
      const code = await main([...RUN, '--record-dir', directory, '--tolerance-ms', '10000'], context);
      expect(context.errors).toEqual([]);
      expect(code).toBe(0);
      const [file] = await readdir(directory);
      const record = JSON.parse(await readFile(join(directory, file!), 'utf8')) as { evidence: string; result: string; operator: { name: string }; steps: Array<{ id: string; confirmed_identity?: string; kind: string }>; scenario: { tolerance_ms: number } };
      expect(validate(record)).toEqual([]);
      expect(record.evidence).toBe('host-runtime');
      expect(record.result).toBe('pass');
      expect(record.operator.name).toBe('Ana');
      expect(record.scenario.tolerance_ms).toBe(10000);
      expect(record.steps.filter((step) => step.kind === 'physical').map((step) => [step.id, step.confirmed_identity])).toEqual([['confirm-identity', 'native_posix'], ['safe-to-drive', 'native_posix']]);
      expect(record.steps.map((step) => step.id)).toEqual(['handshake', 'confirm-identity', 'safe-to-drive', 'scenario', 'release']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
