import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LESSON_INDEX } from '../src/generated/lessonIndex';
import { createAiProvider, SYSTEM_POLICY } from './aiProvider';
import { expectOwnerOnly } from './test/ownerOnlyAccess';

const directories: string[] = [];
async function fixture() {
  // the gateway hands the provider the real path of a project; the temporary folder of macOS (/var) and Windows (8.3 names) is not one
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'zplc-ai-')));
  directories.push(directory);
  await mkdir(join(directory, 'workspace', 'src'), { recursive: true });
  await writeFile(join(directory, 'workspace', 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  return directory;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
const vault = (backend = 'gnome_libsecret') => ({
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => backend,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
});
const request = {
  workspaceId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51',
  mode: 'edit' as const,
  prompt: 'Fix it',
  activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' },
};

describe('optional AI provider (IDE-030)', () => {
  // the plaintext backend exists only on Linux; macOS and Windows keep the key in the OS keychain through safeStorage
  const unconfigured = 'is unconfigured by default and never uses a plaintext Linux fallback (%s)';
  it.each(['linux', 'darwin', 'win32'] as const)(unconfigured, async (platform) => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...original, value: platform });
    try {
      const directory = await fixture();
      const provider = createAiProvider({ userDataPath: directory, vault: vault('basic_text') });
      const linux = platform === 'linux';
      expect(await provider.getStatus()).toEqual({
        configured: false,
        enabled: false,
        keyStored: false,
        vaultAvailable: !linux,
        ...(linux ? { vaultReason: 'insecure-backend' } : {}),
      });
      expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
        ok: false,
        code: linux ? 'AI_VAULT_UNAVAILABLE' : 'AI_UNCONFIGURED',
      });
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
  });

  it('normalizes only HTTPS or loopback endpoints, encrypts the key, and exposes neither', async () => {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test/base/', model: 'gpt-test' })).toEqual({
      ok: true,
    });
    expect(await provider.storeKey('secret-key')).toEqual({ ok: true });
    expect(await provider.getConfig()).toEqual({ enabled: true, endpoint: 'https://api.example.test/base', model: 'gpt-test' });
    expect(JSON.stringify(await Bun.file(join(directory, 'ai-provider.json')).json())).not.toContain('secret-key');
    expect(await provider.saveConfig({ enabled: true, endpoint: 'http://example.test', model: 'gpt-test' })).toEqual({
      ok: false,
      code: 'AI_CONTEXT_REJECTED',
    });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://user@example.test/?key=x', model: 'gpt-test' })).toEqual({
      ok: false,
      code: 'AI_CONTEXT_REJECTED',
    });
  });

  it('fails closed on a symlink state file and secret-like saved ST source', async () => {
    const directory = await fixture();
    const outside = join(directory, 'outside');
    await writeFile(outside, '{}');
    await symlink(outside, join(directory, 'ai-provider.json'));
    const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' })).toEqual({
      ok: false,
      code: 'AI_VAULT_UNAVAILABLE',
    });
    const clean = await fixture();
    const protectedProvider = createAiProvider({ userDataPath: clean, vault: vault() });
    await protectedProvider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await protectedProvider.storeKey('secret');
    await writeFile(join(clean, 'workspace', 'src', 'Main.st'), "api_key := 'secret';");
    expect(await protectedProvider.request(join(clean, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_CONTEXT_REJECTED',
    });
  });

  it('never sends conservatively secret-like ST source while allowing ordinary PLC identifiers', async () => {
    const directory = await fixture();
    let calls = 0;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    for (const source of [
      "ApiSecret := 'x';",
      "access_token := 'x';",
      "Authorization := 'Bearer x';",
      "Endpoint := 'https://user:pass@example.test';",
      "MQTT_PASSWORD := 'x';",
      "AWS_SECRET_ACCESS_KEY := 'x';",
      "cfgAuthorization := 'Bearer x';",
      "myApiSecret := 'x';",
    ]) {
      await writeFile(join(directory, 'workspace', 'src', 'Main.st'), source);
      expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
        ok: false,
        code: 'AI_CONTEXT_REJECTED',
      });
    }
    expect(calls).toBe(0);
    await writeFile(
      join(directory, 'workspace', 'src', 'Main.st'),
      'PROGRAM MotorControl\nVAR\n  MotorTokenCount : INT;\nEND_VAR\nEND_PROGRAM',
    );
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toMatchObject({
      ok: true,
      answer: 'ok',
    });
    expect(calls).toBe(1);
  });

  it('rejects known secret-like prompts in every agent mode before calling a provider', async () => {
    const directory = await fixture();
    let calls = 0;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    for (const candidate of [
      { mode: 'ask' as const, prompt: 'My API_KEY is abc123' },
      { mode: 'plan' as const, prompt: 'Authorization: Bearer abc123' },
      { mode: 'edit' as const, prompt: 'Please use password hunter2 and private key', activeFile: request.activeFile },
      { mode: 'debug' as const, prompt: 'Inspect https://user:pass@example.test/path' },
    ])
      expect(
        await provider.request(
          join(directory, 'workspace'),
          { workspaceId: request.workspaceId, ...candidate },
          new AbortController().signal,
        ),
      ).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('rejects secret-like debug diagnostics and trace labels before calling a provider', async () => {
    const directory = await fixture();
    let calls = 0;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    for (const debugContext of [
      { diagnostics: [{ code: 'MQTT_PASSWORD' }] },
      { diagnostics: [{ code: 'E_AUTH', path: 'Authorization: Bearer abc123' }] },
      { trace: [{ atMs: 1, signal: 'private_key', value: true }] },
    ])
      expect(
        await provider.request(
          join(directory, 'workspace'),
          { workspaceId: request.workspaceId, mode: 'debug', prompt: 'Explain this trace', ...debugContext },
          new AbortController().signal,
        ),
      ).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('defends the file identity again after IPC validation', async () => {
    const directory = await fixture();
    let calls = 0;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    expect(
      await provider.request(
        join(directory, 'workspace'),
        { ...request, activeFile: { ...request.activeFile, fileId: 'file:src/Other.st' } },
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('sends a fixed no-tools request and returns only an inert exact edit proposal', async () => {
    const directory = await fixture();
    let seen: RequestInit | undefined;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async (_url, init) => {
        seen = init;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: 'Done',
                    changes: [{ path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n// fixed\n' }],
                  }),
                },
              },
            ],
          }),
        );
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    const result = await provider.request(join(directory, 'workspace'), request, new AbortController().signal);
    expect(result).toMatchObject({
      ok: true,
      answer: 'Done',
      changes: [{ path: 'src/Main.st', kind: 'modify', baselineSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }],
      fileId: 'file:src/Main.st',
      baselineSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect((result as { changes: Array<{ content: string }> }).changes[0]!.content).toContain('// fixed');
    expect(String(seen?.body)).toContain('"stream":false');
    expect(String(seen?.body)).toContain('Never claim hardware action');
    expect(String(seen?.body)).not.toContain('tool_choice');
    expect(seen?.redirect).toBe('error');
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('rejects provider tool calls, extra change fields, and over-limit streamed data', async () => {
    const directory = await fixture();
    const setup = async (body: string) => {
      const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => new Response(body) });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider;
    };
    const tools = await setup(JSON.stringify({ choices: [{ message: { content: 'x', tool_calls: [] } }] }));
    expect(await tools.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_RESPONSE_INVALID',
    });
    const invalid = await setup(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ answer: 'x', changes: [{ path: 'src/Main.st', content: 'changed', extra: true }] }) } },
        ],
      }),
    );
    expect(await invalid.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_RESPONSE_INVALID',
    });
    const oversized = await setup('x'.repeat(256 * 1024 + 1));
    expect(await oversized.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_RESPONSE_LIMIT',
    });
  });

  it('cancels an in-flight request without leaking an underlying provider error', async () => {
    const directory = await fixture();
    let started: (() => void) | undefined;
    const startedFetch = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async (_url, init) => {
        started?.();
        return await new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }),
        );
      },
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    // every wait is bounded: a request that settles before the fetch, or a cancel that never lands, fails here instead of hanging the shard
    const bound = (label: string) => Bun.sleep(2_000).then(() => ({ unsettled: label }));
    const pending = provider.request(join(directory, 'workspace'), request, new AbortController().signal);
    expect(await Promise.race([startedFetch.then(() => 'fetch started'), pending, bound('fetch')])).toBe('fetch started');
    expect(provider.cancel()).toEqual({ requested: true });
    expect(await Promise.race([pending, bound('cancel')])).toEqual({ ok: false, code: 'AI_CANCELLED' });
  });

  it('accepts a normal OpenAI envelope but rejects malformed JSON and malformed parsed edits', async () => {
    const directory = await fixture();
    const setup = async (body: string) => {
      const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => new Response(body) });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider;
    };
    const ordinary = await setup(
      JSON.stringify({
        id: 'chatcmpl_1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-test',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'An inert explanation.' } }],
        usage: { total_tokens: 1 },
      }),
    );
    expect(await ordinary.request(join(directory, 'workspace'), request, new AbortController().signal)).toMatchObject({
      ok: true,
      answer: 'An inert explanation.',
    });
    const malformed = await setup('{');
    expect(await malformed.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_RESPONSE_INVALID',
    });
    const malformedEdit = await setup(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: 'x', changes: [{ path: 'src/Main.st' }] }) } }],
      }),
    );
    expect(await malformedEdit.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_RESPONSE_INVALID',
    });
  });

  it('fails closed for a symlinked src parent, pre-aborted work, and vault failures', async () => {
    const directory = await fixture();
    const outside = join(directory, 'outside-src');
    await mkdir(outside);
    await writeFile(join(outside, 'Main.st'), 'PROGRAM Escaped END_PROGRAM');
    await rm(join(directory, 'workspace', 'src'), { recursive: true });
    await symlink(outside, join(directory, 'workspace', 'src'));
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })),
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_CONTEXT_REJECTED',
    });
    const aborted = new AbortController();
    aborted.abort();
    expect(await provider.request(join(directory, 'workspace'), request, aborted.signal)).toEqual({ ok: false, code: 'AI_CANCELLED' });
    const broken = createAiProvider({
      userDataPath: await fixture(),
      vault: {
        isEncryptionAvailable: () => {
          throw new Error('no vault');
        },
        encryptString: () => Buffer.alloc(0),
        decryptString: () => '',
      },
    });
    expect((await broken.getStatus()).vaultReason).toBe('unavailable');
  });

  it('creates private random temporary state files and rejects unsafe keys', async () => {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' })).toEqual({ ok: true });
    expectOwnerOnly(join(directory, 'ai-provider.json'), 0o600);
    expect(await provider.storeKey('bad key')).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(await provider.storeKey('bad\nkey')).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
  });

  describe('read in every mode, in the five languages (S4)', () => {
    async function configured(directory: string, fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
      const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: fetchImpl });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider;
    }
    const reply = (content: unknown) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }),
      );
    const sent = (init?: RequestInit) => {
      const messages = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages;
      return JSON.parse(messages[1]!.content) as Record<string, unknown>;
    };
    const ladder = '{"name":"Lamp","variables":{"local":[],"outputs":[]},"rungs":[]}\n';

    it('sends the open program of every language in every mode, with its language', async () => {
      const directory = await fixture();
      const root = join(directory, 'workspace');
      const files: Record<string, string> = {
        'Main.il': 'LD 1\nST Q\n',
        'Lamp.ld.json': ladder,
        'Flow.fbd.json': '{"name":"Flow"}',
        'Seq.sfc.json': '{"name":"Seq"}',
      };
      for (const [name, text] of Object.entries(files)) await writeFile(join(root, 'src', name), text);
      let seen: RequestInit | undefined;
      const provider = await configured(directory, async (_url, init) => {
        seen = init;
        return reply('ok');
      });
      for (const mode of ['ask', 'plan', 'edit', 'debug'] as const)
        for (const [name, text] of Object.entries(files)) {
          const path = `src/${name}`;
          const answer = await provider.request(
            root,
            { workspaceId: request.workspaceId, mode, prompt: 'Explain', activeFile: { fileId: `file:${path}`, path } },
            new AbortController().signal,
          );
          expect(answer, `${mode} ${path}`).toMatchObject({ ok: true, answer: 'ok', path, fileId: `file:${path}` });
          expect(sent(seen).activeFile).toEqual({
            path,
            language: path.endsWith('.il') ? 'IL' : path.endsWith('.ld.json') ? 'LD' : path.endsWith('.fbd.json') ? 'FBD' : 'SFC',
            source: text,
          });
        }
    });

    it('answers without the open program, and without failing, when a non-edit request names one it may not send', async () => {
      const directory = await fixture();
      const root = join(directory, 'workspace');
      await writeFile(join(root, 'src', 'Main.st'), "api_key := 'secret';");
      let seen: RequestInit | undefined;
      const provider = await configured(directory, async (_url, init) => {
        seen = init;
        return reply('ok');
      });
      const answer = await provider.request(root, { ...request, mode: 'ask' }, new AbortController().signal);
      expect(answer).toEqual({ ok: true, answer: 'ok' });
      expect(sent(seen).activeFile).toBeUndefined();
      expect(String(seen?.body)).not.toContain('secret');
    });

    it('sends the list of programs and tasks and the manifest without a sensitive field, and none of the values', async () => {
      const directory = await fixture();
      const root = join(directory, 'workspace');
      await writeFile(join(root, 'src', 'Lamp.ld.json'), ladder);
      await writeFile(join(root, 'src', 'globals.gvl'), 'VAR_GLOBAL END_VAR');
      await writeFile(
        join(root, 'zplc.json'),
        JSON.stringify({
          name: 'Plant',
          version: '1.0.0',
          tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
          network: { wifi: { ssid: 'lab', password: 'hunter2-wifi' } },
          communication: { mqtt: { broker: 'b.example', password: 'hunter2-mqtt', clientKeyPath: '/home/me/key.pem' } },
        }),
      );
      let seen: RequestInit | undefined;
      const provider = await configured(directory, async (_url, init) => {
        seen = init;
        return reply('ok');
      });
      await provider.request(root, { workspaceId: request.workspaceId, mode: 'plan', prompt: 'Review' }, new AbortController().signal);
      const context = sent(seen) as { project: { programs: unknown[]; tasks: unknown[]; manifest: Record<string, unknown> } };
      expect(context.project.programs).toEqual([
        { path: 'src/Lamp.ld.json', language: 'LD' },
        { path: 'src/Main.st', language: 'ST' },
      ]);
      expect(context.project.tasks).toEqual([{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }]);
      expect(context.project.manifest.name).toBe('Plant');
      for (const text of ['hunter2-wifi', 'hunter2-mqtt', 'key.pem', 'password', 'clientKeyPath'])
        expect(JSON.stringify(context)).not.toContain(text);
    });

    it('sends a project without a readable manifest as its list of programs, and never reads a symlinked manifest', async () => {
      const directory = await fixture();
      const root = join(directory, 'workspace');
      await writeFile(join(directory, 'outside.json'), '{"name":"Outside","tasks":[]}');
      await symlink(join(directory, 'outside.json'), join(root, 'zplc.json'));
      let seen: RequestInit | undefined;
      const provider = await configured(directory, async (_url, init) => {
        seen = init;
        return reply('ok');
      });
      await provider.request(root, { workspaceId: request.workspaceId, mode: 'ask', prompt: 'Hi' }, new AbortController().signal);
      expect((sent(seen) as { project: unknown }).project).toEqual({ programs: [{ path: 'src/Main.st', language: 'ST' }] });
      expect(String(seen?.body)).not.toContain('Outside');
    });
  });

  describe('write: one candidate change set (S5)', () => {
    async function configured(directory: string, content: unknown) {
      const provider = createAiProvider({
        userDataPath: directory,
        vault: vault(),
        fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })),
      });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider;
    }
    const manifest = JSON.stringify({ name: 'Plant', version: '1.0.0', tasks: [{ name: 'Main', programs: ['Main.st'] }] });
    const ask = (directory: string, provider: Awaited<ReturnType<typeof configured>>, over: Record<string, unknown> = {}) =>
      provider.request(join(directory, 'workspace'), { ...request, ...over }, new AbortController().signal);

    it('returns a replacement, a new program and a manifest change, each with what it replaces', async () => {
      const directory = await fixture();
      await writeFile(join(directory, 'workspace', 'zplc.json'), manifest);
      const next = JSON.stringify({ name: 'Plant', version: '1.0.0', tasks: [{ name: 'Main', programs: ['Main.st', 'Lamp.ld.json'] }] });
      const provider = await configured(directory, {
        answer: 'Added a lamp',
        changes: [
          { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n// x\n' },
          { path: 'src/Lamp.ld.json', content: '{"name":"Lamp"}' },
          { path: 'zplc.json', content: next },
        ],
      });
      const answer = (await ask(directory, provider)) as { ok: boolean; changes: Array<Record<string, unknown>> };
      expect(answer.ok).toBe(true);
      expect(answer.changes.map(({ path, kind }) => [path, kind])).toEqual([
        ['src/Main.st', 'modify'],
        ['src/Lamp.ld.json', 'create'],
        ['zplc.json', 'modify'],
      ]);
      expect(answer.changes[0]!.baselineSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(answer.changes[1]).not.toHaveProperty('baselineSha256');
      expect(answer.changes[2]!.content).toBe(next);
    });

    it('refuses, as an invalid response, every change set that is not one', async () => {
      const directory = await fixture();
      await writeFile(join(directory, 'workspace', 'zplc.json'), manifest);
      await writeFile(join(directory, 'workspace', 'src', 'Pump.ST.bak'), 'x');
      const file = (name: string) => ({ path: `src/${name}`, content: 'PROGRAM A\nEND_PROGRAM\n' });
      const cases: Array<[string, unknown]> = [
        ['over the cap', ['A.st', 'B.st', 'C.st', 'D.st', 'E.st'].map(file)],
        ['empty', []],
        ['the same file twice', [file('A.st'), file('A.st')]],
        ['the same file by case', [file('A.st'), file('a.st')]],
        ['a path outside src', [{ path: 'src/sub/A.st', content: 'x' }]],
        ['a scenario', [{ path: 'tests/a.scenario.json', content: '{}' }]],
        ['a traversal', [{ path: 'src/../zplc.json', content: '{}' }]],
        ['an empty file', [{ path: 'src/A.st', content: '' }]],
        ['a file that does not change', [{ path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n' }]],
        ['a manifest that is not JSON', [{ path: 'zplc.json', content: '{' }]],
        ['a manifest that is not an object', [{ path: 'zplc.json', content: '[]' }]],
        [
          'a manifest with a password',
          [{ path: 'zplc.json', content: JSON.stringify({ name: 'P', network: { wifi: { password: 'x' } } }) }],
        ],
        [
          'a manifest with a key path',
          [{ path: 'zplc.json', content: JSON.stringify({ name: 'P', communication: { mqtt: { clientKeyPath: '/k' } } }) }],
        ],
      ];
      for (const [label, changes] of cases) {
        const provider = await configured(directory, { answer: 'x', changes });
        expect(await ask(directory, provider), label).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
      }
    });

    it('refuses a new program whose name an existing file already takes, by case or as the same ladder', async () => {
      const directory = await fixture();
      await writeFile(join(directory, 'workspace', 'src', 'Lamp.ld.json'), '{"name":"Lamp"}');
      for (const path of ['src/lamp.ld.json', 'src/MAIN.st']) {
        const provider = await configured(directory, { answer: 'x', changes: [{ path, content: 'PROGRAM A\nEND_PROGRAM\n' }] });
        expect(await ask(directory, provider), path).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
      }
    });

    it('classifies a file by what is on the disk, not by the capped list of the summary, and refuses a link', async () => {
      const directory = await fixture();
      const src = join(directory, 'workspace', 'src');
      for (let index = 0; index < 130; index += 1)
        await writeFile(join(src, `P${String(index).padStart(3, '0')}.st`), 'PROGRAM A\nEND_PROGRAM\n');
      await writeFile(join(src, 'Zeta.st'), 'PROGRAM Zeta\nEND_PROGRAM\n');
      await writeFile(join(directory, 'outside.st'), 'PROGRAM Out\nEND_PROGRAM\n');
      await symlink(join(directory, 'outside.st'), join(src, 'Zlink.st'));
      const beyond = await configured(directory, {
        answer: 'x',
        changes: [{ path: 'src/Zeta.st', content: 'PROGRAM Zeta\nEND_PROGRAM\n// y\n' }],
      });
      expect(await ask(directory, beyond)).toMatchObject({
        ok: true,
        changes: [{ path: 'src/Zeta.st', kind: 'modify', baselineSha256: expect.any(String) }],
      });
      const clash = await configured(directory, { answer: 'x', changes: [{ path: 'src/zeta.st', content: 'PROGRAM A\nEND_PROGRAM\n' }] });
      expect(await ask(directory, clash)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
      const link = await configured(directory, { answer: 'x', changes: [{ path: 'src/Zlink.st', content: 'PROGRAM A\nEND_PROGRAM\n' }] });
      expect(await ask(directory, link)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
      const fresh = await configured(directory, { answer: 'x', changes: [{ path: 'src/Znew.st', content: 'PROGRAM A\nEND_PROGRAM\n' }] });
      expect(await ask(directory, fresh)).toMatchObject({ ok: true, changes: [{ path: 'src/Znew.st', kind: 'create' }] });
    });

    it('accepts a change set only in edit mode', async () => {
      const directory = await fixture();
      const provider = await configured(directory, {
        answer: 'x',
        changes: [{ path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n// y\n' }],
      });
      for (const mode of ['ask', 'plan', 'debug'] as const)
        expect(await ask(directory, provider, { mode }), mode).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    });

    it('still takes a plain explanation, and the old single replacement is no longer a field', async () => {
      const directory = await fixture();
      const plain = await configured(directory, { answer: 'Only words' });
      expect(await ask(directory, plain)).toMatchObject({ ok: true, answer: 'Only words' });
      const old = await configured(directory, { answer: 'x', replacement: { path: 'src/Main.st', content: 'y' } });
      expect(await ask(directory, old)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    });
  });

  describe('editor actions and display settings as proposals (S6, S7)', () => {
    async function configured(directory: string, content: unknown) {
      const provider = createAiProvider({
        userDataPath: directory,
        vault: vault(),
        fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })),
      });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider;
    }
    const proposals = [
      { type: 'openFile', path: 'src/Main.st' },
      { type: 'goToLine', path: 'src/Main.st', line: 2 },
      { type: 'compile' },
      { type: 'setting', name: 'theme', value: 'dark' },
    ];

    it('returns the proposals of an answer in every mode, bounded and validated', async () => {
      const directory = await fixture();
      const provider = await configured(directory, { answer: 'Open it and compile', proposals });
      for (const mode of ['ask', 'plan', 'edit', 'debug'] as const) {
        const answer = await provider.request(
          join(directory, 'workspace'),
          { ...request, mode, ...(mode === 'edit' ? {} : { activeFile: request.activeFile }) },
          new AbortController().signal,
        );
        expect(answer, mode).toMatchObject({ ok: true, answer: 'Open it and compile', proposals });
      }
    });

    it('takes proposals together with a change set', async () => {
      const directory = await fixture();
      const provider = await configured(directory, {
        answer: 'x',
        changes: [{ path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n// z\n' }],
        proposals: [{ type: 'compile' }],
      });
      expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toMatchObject({
        ok: true,
        changes: [{ path: 'src/Main.st' }],
        proposals: [{ type: 'compile' }],
      });
    });

    it('refuses an answer that proposes anything physical, a setting out of reach, too many, or a tool call', async () => {
      const directory = await fixture();
      for (const bad of [
        [{ type: 'deploy' }],
        [{ type: 'setting', name: 'autosaveSeconds', value: 5 }],
        [{ type: 'setting', name: 'unlockAllLessons', value: true }],
        [{ type: 'setting', name: 'theme', value: 'neon' }],
        [{ type: 'openFile', path: 'zplc.json' }],
        Array.from({ length: 7 }, () => ({ type: 'compile' })),
        [],
      ]) {
        const provider = await configured(directory, { answer: 'x', proposals: bad });
        expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal), JSON.stringify(bad)).toEqual({
          ok: false,
          code: 'AI_RESPONSE_INVALID',
        });
      }
      const tools = await configured(directory, { answer: 'x', tool_calls: [{ name: 'deploy' }] });
      expect(await tools.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
        ok: false,
        code: 'AI_RESPONSE_INVALID',
      });
    });

    it('sends no application setting and no provider configuration to the provider', async () => {
      const directory = await fixture();
      let body = '';
      const provider = createAiProvider({
        userDataPath: directory,
        vault: vault(),
        fetch: async (_url, init) => {
          body = String(init.body);
          return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
        },
      });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret-key-value');
      await provider.request(join(directory, 'workspace'), request, new AbortController().signal);
      const user = (JSON.parse(body) as { messages: Array<{ content: string }> }).messages[1]!.content;
      for (const forbidden of [
        'autosaveSeconds',
        'checkForUpdates',
        'unlockAllLessons',
        'hideSolutions',
        'secret-key-value',
        'api.example.test',
      ])
        expect(user).not.toContain(forbidden);
    });
  });
});

describe('each provider failure has its own cause and next step (AI-16)', () => {
  const KEY = 'sk-fake-key-123456';
  const MARKER = 'LEAK-MARKER-from-provider-body';
  async function failing(fetchImpl: () => Promise<Response>) {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: fetchImpl });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey(KEY);
    return provider.request(join(directory, 'workspace'), request, new AbortController().signal);
  }
  const status = (code: number, headers?: Record<string, string>) => async () =>
    new Response(`${MARKER} ${KEY}`, { status: code, headers });

  it('tells a refused key, an unknown model, a rate limit and a server error apart', async () => {
    expect(await failing(status(401))).toEqual({ ok: false, code: 'AI_PROVIDER_AUTH' });
    expect(await failing(status(403))).toEqual({ ok: false, code: 'AI_PROVIDER_AUTH' });
    expect(await failing(status(404))).toEqual({ ok: false, code: 'AI_PROVIDER_MODEL' });
    expect(await failing(status(429))).toEqual({ ok: false, code: 'AI_PROVIDER_RATE_LIMIT' });
    expect(await failing(status(500))).toEqual({ ok: false, code: 'AI_PROVIDER_SERVER' });
    expect(await failing(status(503))).toEqual({ ok: false, code: 'AI_PROVIDER_SERVER' });
    expect(await failing(status(418))).toEqual({ ok: false, code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('keeps the Retry-After seconds of a rate limit, and nothing else it says', async () => {
    expect(await failing(status(429, { 'Retry-After': '42' }))).toEqual({ ok: false, code: 'AI_PROVIDER_RATE_LIMIT', retryAfter: 42 });
    expect(await failing(status(429, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }))).toEqual({
      ok: false,
      code: 'AI_PROVIDER_RATE_LIMIT',
    });
    expect(await failing(status(429, { 'Retry-After': '0' }))).toEqual({ ok: false, code: 'AI_PROVIDER_RATE_LIMIT' });
  });

  it('reports a network failure as an unreachable provider', async () => {
    expect(
      await failing(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toEqual({ ok: false, code: 'AI_PROVIDER_UNREACHABLE' });
  });

  it('puts neither the key nor the provider response in what it answers', async () => {
    for (const answer of [await failing(status(401)), await failing(status(429, { 'Retry-After': '7' })), await failing(status(500))]) {
      const text = JSON.stringify(answer);
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(MARKER);
    }
    const thrown = await failing(async () => {
      throw new Error(`${MARKER} ${KEY}`);
    });
    expect(JSON.stringify(thrown)).not.toContain(KEY);
    expect(JSON.stringify(thrown)).not.toContain(MARKER);
  });
});

describe('assistant answer shapes (AI-14 / AIX-006)', () => {
  const UPDATED_ST = 'PROGRAM Main\nEND_PROGRAM\n// ai-14\n';
  const VALID_EDIT = {
    answer: 'Added comment to Main.st',
    changes: [{ path: 'src/Main.st', content: UPDATED_ST }],
  };

  async function replyWith(content: unknown, mode: 'ask' | 'plan' | 'edit' | 'debug' = 'edit') {
    const directory = await fixture();
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })),
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    return provider.request(join(directory, 'workspace'), { ...request, mode }, new AbortController().signal);
  }

  it('extracts a reviewable change set from raw JSON and Markdown fenced JSON blocks', async () => {
    const raw = await replyWith(JSON.stringify(VALID_EDIT));
    expect(raw).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const fencedJson = await replyWith(`\`\`\`json\n${JSON.stringify(VALID_EDIT, null, 2)}\n\`\`\``);
    expect(fencedJson).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const fencedPlain = await replyWith(`\`\`\`\n${JSON.stringify(VALID_EDIT)}\n\`\`\``);
    expect(fencedPlain).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const stWithBackticks = 'PROGRAM Main\n(* ``` *)\nEND_PROGRAM\n';
    const fencedWithEmbeddedTicks = await replyWith(
      `\`\`\`json\n${JSON.stringify({ answer: 'Kept comment', changes: [{ path: 'src/Main.st', content: stWithBackticks }] })}\n\`\`\``,
    );
    expect(fencedWithEmbeddedTicks).toMatchObject({
      ok: true,
      answer: 'Kept comment',
      changes: [{ path: 'src/Main.st', kind: 'modify', content: stWithBackticks }],
    });
  });

  it('extracts a reviewable change set after prose, both fenced and bare JSON, preserving prose when answer is omitted', async () => {
    const proseBare = await replyWith(`I updated Main.st as requested.\n\n${JSON.stringify(VALID_EDIT)}`);
    expect(proseBare).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const proseFenced = await replyWith(`Here is the proposed edit.\n\n\`\`\`json\n${JSON.stringify(VALID_EDIT)}\n\`\`\``);
    expect(proseFenced).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const proseWithBraces = await replyWith(`Checked {Main} and prepared the change:\n${JSON.stringify(VALID_EDIT)}`);
    expect(proseWithBraces).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const proseFallbackOmitted = await replyWith(
      `Updated Main.st with a trailing comment.\n\n${JSON.stringify({ changes: VALID_EDIT.changes })}`,
    );
    expect(proseFallbackOmitted).toMatchObject({
      ok: true,
      answer: 'Updated Main.st with a trailing comment.',
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const proseFallbackEmpty = await replyWith(
      `Updated Main.st with a trailing comment.\n\`\`\`json\n${JSON.stringify({ answer: '   ', changes: VALID_EDIT.changes })}\n\`\`\``,
    );
    expect(proseFallbackEmpty).toMatchObject({
      ok: true,
      answer: 'Updated Main.st with a trailing comment.',
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });
  });

  it('allows harmless top-level metadata keys on JSON answers without forwarding them', async () => {
    const result = (await replyWith(
      JSON.stringify({
        ...VALID_EDIT,
        notes: 'Reviewed timers',
        reasoning: 'Minimal comment edit',
        confidence: 0.92,
      }),
    )) as Record<string, unknown>;
    expect(result).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('reasoning');
    expect(result).not.toHaveProperty('confidence');
  });

  it('accepts OpenAI-style content parts arrays and rejects unsafe or malformed parts', async () => {
    const singlePart = await replyWith([{ type: 'text', text: JSON.stringify(VALID_EDIT) }]);
    expect(singlePart).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    const multiPart = await replyWith([
      { type: 'text', text: 'Here is the proposed change:' },
      { type: 'text', text: `\`\`\`json\n${JSON.stringify(VALID_EDIT)}\n\`\`\`` },
    ]);
    expect(multiPart).toMatchObject({
      ok: true,
      answer: VALID_EDIT.answer,
      changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }],
    });

    for (const badParts of [
      [],
      ['plain string'],
      [null],
      [{ type: 'text', text: 123 }],
      [{ type: 'tool_use', id: '1', name: 'deploy' }],
      [{ type: 'text', text: 'ok', tool_call: { name: 'deploy' } }],
      [{ type: 'text', text: 'ok', tool_calls: [] }],
      [{ type: 'text', text: 'ok', function_call: { name: 'deploy' } }],
    ]) {
      expect(await replyWith(badParts), JSON.stringify(badParts)).toEqual({
        ok: false,
        code: 'AI_RESPONSE_INVALID',
      });
    }
  });

  it('refuses empty or whitespace-only content instead of returning an empty answer', async () => {
    for (const empty of [
      '',
      '   \n\t  ',
      [{ type: 'text', text: '' }],
      [{ type: 'text', text: '   \n  ' }],
      JSON.stringify({ answer: '' }),
      JSON.stringify({ answer: '   \t\n ' }),
    ]) {
      expect(await replyWith(empty), JSON.stringify(empty)).toEqual({
        ok: false,
        code: 'AI_RESPONSE_INVALID',
      });
    }
  });

  it('keeps plain-text explanations containing example JSON snippets inert', async () => {
    const snippet = 'A minimal manifest looks like:\n```json\n{"name":"Demo","version":"1.0.0"}\n```';
    const result = await replyWith(snippet, 'ask');
    expect(result).toMatchObject({
      ok: true,
      answer: snippet,
    });
    expect(result).not.toHaveProperty('changes');
  });

  it('preserves security boundaries for fenced and prose-wrapped JSON payloads', async () => {
    const fencedToolCall = `\`\`\`json\n${JSON.stringify({ answer: 'x', tool_calls: [{ name: 'deploy' }] })}\n\`\`\``;
    expect(await replyWith(fencedToolCall)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const proseNestedToolCall = `Sure.\n${JSON.stringify({ answer: 'x', meta: { tool_calls: [{ name: 'flash' }] } })}`;
    expect(await replyWith(proseNestedToolCall)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedFunctionCall = `\`\`\`json\n${JSON.stringify({ answer: 'x', function_call: { name: 'run' } })}\n\`\`\``;
    expect(await replyWith(fencedFunctionCall)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedExtraChangeField = `\`\`\`json\n${JSON.stringify({
      answer: 'x',
      changes: [{ path: 'src/Main.st', content: UPDATED_ST, extra: true }],
    })}\n\`\`\``;
    expect(await replyWith(fencedExtraChangeField)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedAskChanges = `\`\`\`json\n${JSON.stringify(VALID_EDIT)}\n\`\`\``;
    expect(await replyWith(fencedAskChanges, 'ask')).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const proseAskChanges = `Here is a fix:\n${JSON.stringify(VALID_EDIT)}`;
    expect(await replyWith(proseAskChanges, 'ask')).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedTraversal = `\`\`\`json\n${JSON.stringify({
      answer: 'x',
      changes: [{ path: 'src/../zplc.json', content: '{}' }],
    })}\n\`\`\``;
    expect(await replyWith(fencedTraversal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const proseTraversal = `Fixed:\n${JSON.stringify({
      answer: 'x',
      changes: [{ path: '../outside.st', content: UPDATED_ST }],
    })}`;
    expect(await replyWith(proseTraversal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedPhysicalProposal = `\`\`\`json\n${JSON.stringify({
      answer: 'x',
      proposals: [{ type: 'deploy' }],
    })}\n\`\`\``;
    expect(await replyWith(fencedPhysicalProposal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedLegacyReplacement = `\`\`\`json\n${JSON.stringify({
      answer: 'x',
      replacement: { path: 'src/Main.st', content: UPDATED_ST },
    })}\n\`\`\``;
    expect(await replyWith(fencedLegacyReplacement)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const fencedWithTrailingToolCall = `\`\`\`json\n${JSON.stringify(VALID_EDIT)}\n\`\`\`\n${JSON.stringify({
      tool_calls: [{ name: 'deploy' }],
    })}`;
    expect(await replyWith(fencedWithTrailingToolCall)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
  });

  // R-07: an ```st fence is not a json fence; the object inside it is read by the bare-object scan and must stay as strict as the bare form
  const stFence = (body: string) => `\`\`\`st\n${body}\n\`\`\``;

  it('AI-14 reads a structured answer inside an st fence as the bare object', async () => {
    const bare = await replyWith(JSON.stringify(VALID_EDIT));
    expect(bare).toMatchObject({ ok: true, changes: [{ path: 'src/Main.st', kind: 'modify', content: UPDATED_ST }] });
    expect(await replyWith(stFence(JSON.stringify(VALID_EDIT)))).toEqual(bare);
  });

  it('AI-14 lets an st fence bypass no refusal of the structured answer', async () => {
    const withManifest = async (content: string) => {
      const directory = await fixture();
      await writeFile(join(directory, 'workspace', 'zplc.json'), JSON.stringify({ name: 'P' }));
      const provider = createAiProvider({
        userDataPath: directory,
        vault: vault(),
        fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })),
      });
      await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
      await provider.storeKey('secret');
      return provider.request(join(directory, 'workspace'), { ...request, mode: 'edit' }, new AbortController().signal);
    };
    const manifest = (value: unknown) => JSON.stringify({ answer: 'x', changes: [{ path: 'zplc.json', content: JSON.stringify(value) }] });
    // the same manifest change without the credential is accepted, so the credential is what refuses it
    expect(await withManifest(stFence(manifest({ name: 'P', version: '1.0.0' })))).toMatchObject({ ok: true });
    const credential = manifest({ name: 'P', network: { wifi: { password: 'hunter2' } } });
    expect(await withManifest(credential)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    expect(await withManifest(stFence(credential))).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });

    const refused: Array<[string, string]> = [
      ['a top-level replacement', JSON.stringify({ answer: 'x', replacement: { path: 'src/Main.st', content: UPDATED_ST } })],
      ['tool_calls', JSON.stringify({ ...VALID_EDIT, tool_calls: [{ name: 'deploy' }] })],
      ['an unknown change key', JSON.stringify({ answer: 'x', changes: [{ path: 'src/Main.st', content: UPDATED_ST, extra: true }] })],
    ];
    for (const [label, body] of refused) {
      expect(await replyWith(body), label).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
      expect(await replyWith(stFence(body)), `st fence: ${label}`).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    }

    const huge = JSON.stringify({ answer: 'x'.repeat(256 * 1024), changes: VALID_EDIT.changes });
    expect(await replyWith(huge)).toEqual({ ok: false, code: 'AI_RESPONSE_LIMIT' });
    expect(await replyWith(stFence(huge))).toEqual({ ok: false, code: 'AI_RESPONSE_LIMIT' });
  });

  it('AI-14 reads an st fence of Structured Text without a JSON object as no structured answer', async () => {
    const message = `Here is the program:\n${stFence('PROGRAM Main\nVAR x : INT; END_VAR\nx := x + 1;\nEND_PROGRAM')}`;
    const result = await replyWith(message);
    expect(result).toMatchObject({ ok: true, answer: message });
    expect(result).not.toHaveProperty('changes');
    expect(result).not.toHaveProperty('proposals');
  });
});

const LESSON = LESSON_INDEX.lessons.find((lesson) => lesson.id === 'ld-no-nc-contacts')!;
const SENTINEL_BODY = 'SENTINEL-stage-body-with-the-answer';
const SENTINEL_LAST_HINT = 'SENTINEL-last-hint-swap-the-contact';
const lessonText = {
  schemaVersion: 1,
  title: 'A stop button wired normally closed',
  summary: 'Stop the motor when the wire breaks.',
  scope: 'LD',
  objectives: ['Use an NC contact for Stop'],
  stages: [{ key: 'edit', title: 'Change the rung', body: SENTINEL_BODY, checkpoint: 'c' }],
  hints: [
    { level: 1, text: 'Which contact opens when the wire breaks?' },
    { level: 2, text: SENTINEL_LAST_HINT },
  ],
  faultCases: [],
};

describe('the assistant gets the context of the project, the plant and the lesson (AIX-001, AIX-002, AI-15, AI-21)', () => {
  const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  async function workspace() {
    const directory = await fixture();
    const root = join(directory, 'workspace');
    await mkdir(join(root, 'tests'), { recursive: true });
    await writeFile(
      join(root, 'scene.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'Belt to sensor',
        parts: [{ id: 'belt-1', part: 'belt', name: 'Belt', position: { x: 1, y: 0, z: 0 }, config: { secret: 'S3CRET' } }],
        cameras: [],
      }),
    );
    await writeFile(
      join(root, 'plant-map.json'),
      JSON.stringify({ schemaVersion: 2, signals: { 'Belt.Run': { direction: 'command', type: 'BOOL', point: 'Main.Run' } } }),
    );
    await writeFile(
      join(root, 'tests', 'belt.scenario.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'Belt',
        tickMs: 10,
        durationMs: 500,
        events: [],
        expectations: [{ kind: 'at', atMs: 10, condition: { 'Belt.Run': true } }],
      }),
    );
    return { directory, root };
  }
  async function ask(
    options: { solutionsHidden?: () => Promise<boolean>; lessonOf?: boolean },
    extra: Record<string, unknown>,
    prepare?: (root: string) => Promise<void>,
  ) {
    const { directory, root } = await workspace();
    await prepare?.(root);
    let seen: RequestInit | undefined;
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      fetch: async (_url, init) => {
        seen = init;
        return reply();
      },
      ...(options.solutionsHidden ? { solutionsHidden: options.solutionsHidden } : {}),
      ...(options.lessonOf === false ? {} : { lessonOf: () => ({ manifest: LESSON, text: lessonText }) }),
    });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    await provider.storeKey('secret');
    const result = await provider.request(
      root,
      { workspaceId: request.workspaceId, mode: 'ask', prompt: 'Why does it not run?', ...extra } as never,
      new AbortController().signal,
    );
    const body = seen ? (JSON.parse(String(seen.body)) as { messages: Array<{ role: string; content: string }> }) : undefined;
    // the parsed context is read by path in every test below; a type for it would only repeat the context builder's
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { result, seen, body, context: body ? (JSON.parse(body.messages.at(-1)!.content) as Record<string, any>) : undefined };
  }
  const failed = [
    { id: 'Belt', assertions: [{ index: 0, kind: 'at', atMs: 10, checks: [{ signal: 'Belt.Run', expected: true, observed: false }] }] },
  ];

  it('sends the plant, the scenarios, the failed checks, the facts, the diagnostics with their message and the lesson goal', async () => {
    const { result, context } = await ask(
      { solutionsHidden: async () => false },
      {
        failedScenarios: failed,
        facts: { 'fact:itemsDropped': 2 },
        diagnostics: [{ code: 'E_TYPE', message: 'Type mismatch on the coil', path: 'src/Main.st', line: 3, element: 'rung:r1' }],
        selection: { startLine: 2, endLine: 3, text: 'Run := TRUE;' },
        lessonContext: { lessonId: 'ld-no-nc-contacts', stage: 'edit' },
        locale: 'es',
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(context!.locale).toBe('es');
    expect(context!.selection).toEqual({ startLine: 2, endLine: 3, text: 'Run := TRUE;' });
    const sent = context!.context;
    expect(sent.plant.scene).toEqual({ name: 'Belt to sensor', parts: [{ id: 'belt-1', name: 'Belt', part: 'belt' }] });
    expect(sent.plant.signals).toEqual([{ name: 'Belt.Run', direction: 'command', type: 'BOOL', point: 'Main.Run' }]);
    expect(sent.scenarios[0]).toMatchObject({ id: 'Belt', path: 'tests/belt.scenario.json' });
    expect(sent.failedScenarios).toEqual(failed);
    expect(sent.facts).toEqual({ 'fact:itemsDropped': 2 });
    expect(sent.diagnostics).toEqual([
      { code: 'E_TYPE', message: 'Type mismatch on the coil', path: 'src/Main.st', line: 3, element: 'rung:r1' },
    ]);
    expect(sent.lesson).toMatchObject({
      lessonId: 'ld-no-nc-contacts',
      goal: 'Stop the motor when the wire breaks.',
      stage: { key: 'edit', title: 'Change the rung' },
      solutionsHidden: false,
    });
    expect(JSON.stringify(context)).not.toContain('S3CRET');
  });

  it('bounds what it sends: four failed scenarios, 256 characters of a message, sixty-four list items', async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ id: `F${i}`, assertions: failed[0]!.assertions }));
    const { context } = await ask({}, { failedScenarios: many, diagnostics: [{ code: 'E_X', message: 'm'.repeat(256) }] });
    expect(context!.context.failedScenarios).toHaveLength(4);
    expect(context!.context.diagnostics[0].message).toHaveLength(256);
    const bigScene = async (root: string) => {
      const parts = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, part: 'belt', name: `P${i}` }));
      await writeFile(join(root, 'scene.json'), JSON.stringify({ schemaVersion: 1, name: 'Big', parts, cameras: [] }));
    };
    const { context: big } = await ask({}, {}, bigScene);
    expect(big!.context.plant.scene.parts).toHaveLength(64);
  });

  it('puts the earlier exchanges of the conversation between the system text and the question, (AI-18)', async () => {
    const history = [
      { role: 'user', text: 'What is a scan?' },
      { role: 'assistant', text: 'One pass of the program.' },
    ];
    const { body } = await ask({}, { history });
    expect(body!.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(body!.messages[1]!.content).toBe('What is a scan?');
    expect(JSON.parse(body!.messages[3]!.content).prompt).toBe('Why does it not run?');
  });

  it('sends no history at all when an earlier exchange holds something that looks like a key (AI-18)', async () => {
    const { result, body } = await ask({}, { history: [{ role: 'assistant', text: 'use the api_key sk-abc' }] });
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(body!.messages).toHaveLength(2);
  });

  it('with solutions hidden, or unknown, the context has no solution, no stage text and no last hint, and the system says so', async () => {
    for (const hidden of [
      { solutionsHidden: async () => true },
      {},
      { solutionsHidden: async () => Promise.reject(new Error('unreadable')) },
    ]) {
      const { body, context } = await ask(hidden, { lessonContext: { lessonId: 'ld-no-nc-contacts', stage: 'edit' } });
      const text = JSON.stringify(body);
      expect(context!.context.lesson.solutionsHidden).toBe(true);
      expect(text).not.toContain(SENTINEL_BODY);
      expect(text).not.toContain(SENTINEL_LAST_HINT);
      expect(text).not.toContain(LESSON.solution.project);
      expect(body!.messages[0]!.content).toContain(
        'Solutions are hidden by the classroom setting. Give guidance and hints only; NEVER write a complete solution program.',
      );
    }
  });

  it('with solutions shown it says so, keeps every hint, and still carries no solution or stage text', async () => {
    const { body, context } = await ask({ solutionsHidden: async () => false }, { lessonContext: { lessonId: 'ld-no-nc-contacts' } });
    expect(context!.context.lesson.solutionsHidden).toBe(false);
    expect(context!.context.lesson.hints).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain(SENTINEL_BODY);
    expect(JSON.stringify(body)).not.toContain(LESSON.solution.project);
    expect(body!.messages[0]!.content).not.toContain('Solutions are hidden by the classroom setting');
  });

  it('sends no lesson without a lesson context, and an unknown lesson id sends none either', async () => {
    expect((await ask({}, {})).context!.context.lesson).toBeUndefined();
    const unknown = await createAiProvider({ userDataPath: await fixture(), vault: vault() });
    expect(unknown).toBeDefined();
    expect((await ask({ lessonOf: false }, { lessonContext: { lessonId: 'ld-no-nc-contacts' } })).context!.context.lesson).toBeUndefined();
  });

  it('keeps what matters and drops the rest in order when the body is over 128 KiB', async () => {
    const scenario = (n: number) =>
      JSON.stringify({
        schemaVersion: 1,
        id: `S${n}`,
        events: [],
        expectations: Array.from({ length: 64 }, (_, i) => ({
          kind: 'at',
          atMs: i,
          condition: { [`Plant.Signal${n}_${i}`]: true, [`Plant.Other${n}_${i}`]: false, [`Plant.More${n}_${i}`]: 1 },
        })),
      });
    const { result, body, context } = await ask(
      { solutionsHidden: async () => false },
      {
        failedScenarios: failed,
        diagnostics: [{ code: 'E_TYPE', message: 'Type mismatch on the coil' }],
        lessonContext: { lessonId: 'ld-no-nc-contacts' },
        activeFile: { fileId: 'file:src/Big.st', path: 'src/Big.st' },
        history: [
          { role: 'user', text: 'u'.repeat(2048) },
          { role: 'assistant', text: 'a'.repeat(2048) },
        ],
      },
      async (root) => {
        for (let n = 0; n < 16; n += 1) await writeFile(join(root, 'tests', `s${n}.scenario.json`), scenario(n));
        await writeFile(join(root, 'src', 'Big.st'), `PROGRAM Big\n${'(* filler *)\n'.repeat(4000)}END_PROGRAM\n`);
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(Buffer.byteLength(String(JSON.stringify(body)))).toBeLessThanOrEqual(128 * 1024);
    expect(context!.context.failedScenarios).toEqual(failed);
    expect(context!.context.diagnostics[0].message).toBe('Type mismatch on the coil');
    expect(context!.context.lesson.goal).toBe('Stop the motor when the wire breaks.');
    expect(context!.context.scenarios).toEqual([]);
  });

  it('refuses a secret-like diagnostic message or selection before calling a provider', async () => {
    for (const extra of [
      { diagnostics: [{ code: 'E_X', message: 'Authorization: Bearer abc123' }] },
      { selection: { startLine: 1, endLine: 1, text: 'api_key := 1;' } },
    ]) {
      const { result, seen } = await ask({}, extra);
      expect(result).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
      expect(seen).toBeUndefined();
    }
  });
});

describe('the system policy (AIX-005, AI-21, rule 8)', () => {
  it('opens with the one name, and states the approved rule 8 sentence exactly', () => {
    expect(SYSTEM_POLICY.startsWith('You are ZPLC Assistant.')).toBe(true);
    expect(SYSTEM_POLICY).not.toContain('ZPLC Agent');
    expect(SYSTEM_POLICY).toContain(
      'An AI assistant or MCP never initiates them on hardware or on a session a person runs: it never forces I/O, changes RUN/STOP, ' +
        'flashes, deploys or opens a serial port there. ' +
        'It may set inputs and step a simulator that is private to it, one the MCP server starts for that agent alone (D-31, AIX-014).',
    );
    expect(SYSTEM_POLICY).toContain('Never claim hardware action');
  });

  it('carries the lesson stance of D-32: a hint first, a solution only when asked plainly and shown, never a pass', () => {
    expect(SYSTEM_POLICY).toContain('give a hint first');
    expect(SYSTEM_POLICY).toContain('give a solution only when the person asks for it plainly and lesson.solutionsHidden is false');
    expect(SYSTEM_POLICY).toContain('never give a solution when lesson.solutionsHidden is true');
    expect(SYSTEM_POLICY).toContain('never say that a lesson is passed; only the Check control marks it');
  });

  it('asks for the reply in the locale of the interface and names the glossary', () => {
    expect(SYSTEM_POLICY).toContain('Reply in the language of "locale" ("en" or "es")');
    for (const term of ['rung', 'coil', 'contact', 'function block', 'step', 'transition', 'scan', 'scenario', 'plant map', 'Check'])
      expect(SYSTEM_POLICY).toContain(term);
  });
});

describe('a local model on loopback needs no key (AIX-006, AI-17)', () => {
  async function local(
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
    endpoint = 'http://localhost:11434',
    backend = 'basic_text',
  ) {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault(backend), fetch: fetchImpl });
    expect(await provider.saveConfig({ enabled: true, endpoint, model: 'llama3' })).toEqual({ ok: true });
    return { provider, directory };
  }
  const ok = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }));
  const ask = { workspaceId: request.workspaceId, mode: 'ask' as const, prompt: 'hello' };

  it('is configured without a key, and sends the request without an Authorization header', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const { provider, directory } = await local(async (url, init) => {
      seen = { url, init };
      return ok();
    });
    expect(await provider.getStatus()).toMatchObject({ configured: true, enabled: true, keyStored: false });
    expect(await provider.request(join(directory, 'workspace'), ask, new AbortController().signal)).toMatchObject({
      ok: true,
      answer: 'hi',
    });
    expect(seen!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(Object.keys(seen!.init.headers as Record<string, string>)).toEqual(['Content-Type']);
    expect(seen!.init.redirect).toBe('error');
  });

  it('works for the three loopback hosts, and sends a key that is stored anyway', async () => {
    for (const endpoint of ['http://127.0.0.1:1234', 'http://[::1]:8080']) {
      const { provider, directory } = await local(ok, endpoint);
      expect(await provider.getStatus()).toMatchObject({ configured: true });
      expect(await provider.request(join(directory, 'workspace'), ask, new AbortController().signal)).toMatchObject({ ok: true });
    }
    let auth: unknown;
    const { provider, directory } = await local(
      async (_url, init) => {
        auth = (init.headers as Record<string, string>).Authorization;
        return ok();
      },
      'http://localhost:11434',
      'gnome_libsecret',
    );
    await provider.storeKey('local-key');
    await provider.request(join(directory, 'workspace'), ask, new AbortController().signal);
    expect(auth).toBe('Bearer local-key');
  });

  it('still needs a stored key for a hosted https endpoint, and refuses any other host', async () => {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: ok });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' });
    expect(await provider.getStatus()).toMatchObject({ configured: false });
    expect(await provider.request(join(directory, 'workspace'), ask, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_UNCONFIGURED',
    });
    for (const endpoint of ['http://localhost.evil.test', 'http://127.0.0.2', 'http://[::ffff:127.0.0.1]', 'http://example.test'])
      expect(await provider.saveConfig({ enabled: true, endpoint, model: 'gpt-test' }), endpoint).toEqual({
        ok: false,
        code: 'AI_CONTEXT_REJECTED',
      });
  });

  it('does not follow a redirect: a loopback server that redirects elsewhere is an unreachable provider', async () => {
    let hits = 0;
    const target = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => ((hits += 1), new Response('{}')) });
    const redirecting = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response(null, { status: 307, headers: { Location: `http://127.0.0.1:${target.port}/stolen` } }),
    });
    try {
      const directory = await fixture();
      const provider = createAiProvider({ userDataPath: directory, vault: vault('basic_text') });
      await provider.saveConfig({ enabled: true, endpoint: `http://127.0.0.1:${redirecting.port}`, model: 'm' });
      expect(await provider.request(join(directory, 'workspace'), ask, new AbortController().signal)).toEqual({
        ok: false,
        code: 'AI_PROVIDER_UNREACHABLE',
      });
      expect(await provider.testConnection()).toEqual({ ok: false, code: 'AI_PROVIDER_UNREACHABLE' });
      expect(hits).toBe(0);
    } finally {
      await redirecting.stop(true);
      await target.stop(true);
    }
  });
});

describe('the connection test (AIX-006)', () => {
  const KEY = 'sk-test-key-98765';
  type Seen = { method: string; auth: string | null; body: Record<string, unknown> };
  async function against(handler: (seen: Seen) => Response | Promise<Response>, options: { key?: boolean; timeout?: number } = {}) {
    const seen: Seen[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(incoming) {
        const entry = {
          method: incoming.method,
          auth: incoming.headers.get('authorization'),
          body: (await incoming.json()) as Record<string, unknown>,
        };
        seen.push(entry);
        return handler(entry);
      },
    });
    const directory = await fixture();
    const provider = createAiProvider({
      userDataPath: directory,
      vault: vault(),
      ...(options.timeout ? { probeTimeoutMs: options.timeout } : {}),
    });
    await provider.saveConfig({ enabled: true, endpoint: `http://127.0.0.1:${server.port}`, model: 'llama3' });
    if (options.key) await provider.storeKey(KEY);
    return { provider, seen, stop: () => server.stop(true) };
  }

  it('sends one minimal request with no project data and answers ok with the latency', async () => {
    const { provider, seen, stop } = await against(() => new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] })));
    try {
      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true, latencyMs: expect.any(Number) });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({
        method: 'POST',
        auth: null,
        body: { model: 'llama3', stream: false, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
      });
    } finally {
      await stop();
    }
  });

  it('sends the key when one is stored, and never puts it in what it answers', async () => {
    const { provider, seen, stop } = await against(() => new Response(`rejected ${KEY}`, { status: 401 }), { key: true });
    try {
      const result = await provider.testConnection();
      expect(result).toEqual({ ok: false, code: 'AI_PROVIDER_AUTH' });
      expect(seen[0]!.auth).toBe(`Bearer ${KEY}`);
      expect(JSON.stringify(result)).not.toContain(KEY);
    } finally {
      await stop();
    }
  });

  it('says what failed: a model that is not there, a rate limit with its wait, a server error', async () => {
    for (const [status, headers, expected] of [
      [404, {}, { ok: false, code: 'AI_PROVIDER_MODEL' }],
      [429, { 'Retry-After': '12' }, { ok: false, code: 'AI_PROVIDER_RATE_LIMIT', retryAfter: 12 }],
      [500, {}, { ok: false, code: 'AI_PROVIDER_SERVER' }],
    ] as const) {
      const { provider, stop } = await against(() => new Response('no', { status, headers }));
      try {
        expect(await provider.testConnection()).toEqual(expected);
      } finally {
        await stop();
      }
    }
  });

  it('answers unreachable when nothing listens, unconfigured when nothing is saved, and times out', async () => {
    const closed = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') });
    const port = closed.port;
    await closed.stop(true);
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.testConnection()).toEqual({ ok: false, code: 'AI_UNCONFIGURED' });
    await provider.saveConfig({ enabled: true, endpoint: `http://127.0.0.1:${port}`, model: 'm' });
    expect(await provider.testConnection()).toEqual({ ok: false, code: 'AI_PROVIDER_UNREACHABLE' });
    const { provider: slow, stop } = await against(() => new Promise<Response>(() => undefined), { timeout: 50 });
    try {
      expect(await slow.testConnection()).toEqual({ ok: false, code: 'AI_TIMEOUT' });
    } finally {
      await stop();
    }
  });

  it('needs a stored key for a hosted endpoint, and sends nothing without it', async () => {
    let calls = 0;
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => ((calls += 1), new Response('{}')) });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'm' });
    expect(await provider.testConnection()).toEqual({ ok: false, code: 'AI_UNCONFIGURED' });
    expect(calls).toBe(0);
  });
});
