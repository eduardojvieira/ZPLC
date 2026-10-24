import { afterEach, describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAiProvider } from './aiProvider';

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-ai-'));
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
  it('is unconfigured by default and never uses a plaintext Linux fallback', async () => {
    const directory = await fixture();
    const provider = createAiProvider({ userDataPath: directory, vault: vault('basic_text') });
    expect(await provider.getStatus()).toEqual({
      configured: false,
      enabled: false,
      keyStored: false,
      vaultAvailable: false,
      vaultReason: 'insecure-backend',
    });
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
      ok: false,
      code: 'AI_VAULT_UNAVAILABLE',
    });
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
    const pending = provider.request(join(directory, 'workspace'), request, new AbortController().signal);
    await startedFetch;
    expect(provider.cancel()).toEqual({ requested: true });
    expect(await pending).toEqual({ ok: false, code: 'AI_CANCELLED' });
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
    const extra = await setup(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'x', extra: true }) } }] }));
    expect(await extra.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({
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
    expect((await lstat(join(directory, 'ai-provider.json'))).mode & 0o077).toBe(0);
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
