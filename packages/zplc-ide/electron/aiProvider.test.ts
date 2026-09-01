import { afterEach, describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAiProvider } from './aiProvider';

const directories: string[] = [];
async function fixture() { const directory = await mkdtemp(join(tmpdir(), 'zplc-ai-')); directories.push(directory); await mkdir(join(directory, 'workspace', 'src'), { recursive: true }); await writeFile(join(directory, 'workspace', 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n'); return directory; }
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
const vault = (backend = 'gnome_libsecret') => ({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend, encryptString: (value: string) => Buffer.from(`encrypted:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, '') });
const request = { workspaceId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51', mode: 'edit' as const, prompt: 'Fix it', activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' } };

describe('optional AI provider', () => {
  it('is unconfigured by default and never uses a plaintext Linux fallback', async () => {
    const directory = await fixture(); const provider = createAiProvider({ userDataPath: directory, vault: vault('basic_text') });
    expect(await provider.getStatus()).toEqual({ configured: false, enabled: false, keyStored: false, vaultAvailable: false, vaultReason: 'insecure-backend' });
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_VAULT_UNAVAILABLE' });
  });

  it('normalizes only HTTPS or loopback endpoints, encrypts the key, and exposes neither', async () => {
    const directory = await fixture(); const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test/base/', model: 'gpt-test' })).toEqual({ ok: true });
    expect(await provider.storeKey('secret-key')).toEqual({ ok: true });
    expect(await provider.getConfig()).toEqual({ enabled: true, endpoint: 'https://api.example.test/base', model: 'gpt-test' });
    expect(JSON.stringify(await Bun.file(join(directory, 'ai-provider.json')).json())).not.toContain('secret-key');
    expect(await provider.saveConfig({ enabled: true, endpoint: 'http://example.test', model: 'gpt-test' })).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://user@example.test/?key=x', model: 'gpt-test' })).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
  });

  it('fails closed on a symlink state file and secret-like saved ST source', async () => {
    const directory = await fixture(); const outside = join(directory, 'outside'); await writeFile(outside, '{}'); await symlink(outside, join(directory, 'ai-provider.json'));
    const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' })).toEqual({ ok: false, code: 'AI_VAULT_UNAVAILABLE' });
    const clean = await fixture(); const protectedProvider = createAiProvider({ userDataPath: clean, vault: vault() }); await protectedProvider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await protectedProvider.storeKey('secret'); await writeFile(join(clean, 'workspace', 'src', 'Main.st'), 'api_key := \'secret\';');
    expect(await protectedProvider.request(join(clean, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
  });

  it('never sends conservatively secret-like ST source while allowing ordinary PLC identifiers', async () => {
    const directory = await fixture(); let calls = 0;
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    for (const source of ["ApiSecret := 'x';", "access_token := 'x';", "Authorization := 'Bearer x';", 'Endpoint := \'https://user:pass@example.test\';', "MQTT_PASSWORD := 'x';", "AWS_SECRET_ACCESS_KEY := 'x';", "cfgAuthorization := 'Bearer x';", "myApiSecret := 'x';"]) {
      await writeFile(join(directory, 'workspace', 'src', 'Main.st'), source);
      expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    }
    expect(calls).toBe(0);
    await writeFile(join(directory, 'workspace', 'src', 'Main.st'), 'PROGRAM MotorControl\nVAR\n  MotorTokenCount : INT;\nEND_VAR\nEND_PROGRAM');
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toMatchObject({ ok: true, answer: 'ok' });
    expect(calls).toBe(1);
  });

  it('rejects known secret-like prompts in every agent mode before calling a provider', async () => {
    const directory = await fixture(); let calls = 0;
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    for (const candidate of [
      { mode: 'ask' as const, prompt: 'My API_KEY is abc123' },
      { mode: 'plan' as const, prompt: 'Authorization: Bearer abc123' },
      { mode: 'edit' as const, prompt: 'Please use password hunter2 and private key', activeFile: request.activeFile },
      { mode: 'debug' as const, prompt: 'Inspect https://user:pass@example.test/path' },
    ]) expect(await provider.request(join(directory, 'workspace'), { workspaceId: request.workspaceId, ...candidate }, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('rejects secret-like debug diagnostics and trace labels before calling a provider', async () => {
    const directory = await fixture(); let calls = 0;
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    for (const debugContext of [
      { diagnostics: [{ code: 'MQTT_PASSWORD' }] },
      { diagnostics: [{ code: 'E_AUTH', path: 'Authorization: Bearer abc123' }] },
      { trace: [{ atMs: 1, signal: 'private_key', value: true }] },
    ]) expect(await provider.request(join(directory, 'workspace'), { workspaceId: request.workspaceId, mode: 'debug', prompt: 'Explain this trace', ...debugContext }, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('defends the file identity again after IPC validation', async () => {
    const directory = await fixture(); let calls = 0;
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    expect(await provider.request(join(directory, 'workspace'), { ...request, activeFile: { ...request.activeFile, fileId: 'file:src/Other.st' } }, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(calls).toBe(0);
  });

  it('sends a fixed no-tools request and returns only an inert exact edit proposal', async () => {
    const directory = await fixture(); let seen: RequestInit | undefined;
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async (_url, init) => { seen = init; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'Done', replacement: { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n// fixed\n' } }) } }] })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    const result = await provider.request(join(directory, 'workspace'), request, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, answer: 'Done', replacement: { path: 'src/Main.st' }, fileId: 'file:src/Main.st', baselineSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(String(seen?.body)).toContain('"stream":false'); expect(String(seen?.body)).toContain('Never claim hardware action'); expect(String(seen?.body)).not.toContain('tool_choice'); expect(seen?.redirect).toBe('error'); expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('rejects provider tool calls, extra replacement fields, and over-limit streamed data', async () => {
    const directory = await fixture(); const setup = async (body: string) => { const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => new Response(body) }); await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret'); return provider; };
    const tools = await setup(JSON.stringify({ choices: [{ message: { content: 'x', tool_calls: [] } }] }));
    expect(await tools.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    const invalid = await setup(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'x', replacement: { path: 'src/Main.st', content: 'changed', extra: true } }) } }] }));
    expect(await invalid.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    const oversized = await setup('x'.repeat(256 * 1024 + 1));
    expect(await oversized.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_RESPONSE_LIMIT' });
  });

  it('cancels an in-flight request without leaking an underlying provider error', async () => {
    const directory = await fixture();
    let started: (() => void) | undefined; const startedFetch = new Promise<void>((resolve) => { started = resolve; });
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async (_url, init) => { started?.(); return await new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })); } });
    await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    const pending = provider.request(join(directory, 'workspace'), request, new AbortController().signal);
    await startedFetch;
    expect(provider.cancel()).toEqual({ requested: true });
    expect(await pending).toEqual({ ok: false, code: 'AI_CANCELLED' });
  });

  it('accepts a normal OpenAI envelope but rejects malformed JSON and malformed parsed edits', async () => {
    const directory = await fixture();
    const setup = async (body: string) => { const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => new Response(body) }); await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret'); return provider; };
    const ordinary = await setup(JSON.stringify({ id: 'chatcmpl_1', object: 'chat.completion', created: 1, model: 'gpt-test', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'An inert explanation.' } }], usage: { total_tokens: 1 } }));
    expect(await ordinary.request(join(directory, 'workspace'), request, new AbortController().signal)).toMatchObject({ ok: true, answer: 'An inert explanation.' });
    const malformed = await setup('{');
    expect(await malformed.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
    const extra = await setup(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'x', extra: true }) } }] }));
    expect(await extra.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_RESPONSE_INVALID' });
  });

  it('fails closed for a symlinked src parent, pre-aborted work, and vault failures', async () => {
    const directory = await fixture(); const outside = join(directory, 'outside-src'); await mkdir(outside); await writeFile(join(outside, 'Main.st'), 'PROGRAM Escaped END_PROGRAM'); await rm(join(directory, 'workspace', 'src'), { recursive: true }); await symlink(outside, join(directory, 'workspace', 'src'));
    const provider = createAiProvider({ userDataPath: directory, vault: vault(), fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] })) }); await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' }); await provider.storeKey('secret');
    expect(await provider.request(join(directory, 'workspace'), request, new AbortController().signal)).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    const aborted = new AbortController(); aborted.abort(); expect(await provider.request(join(directory, 'workspace'), request, aborted.signal)).toEqual({ ok: false, code: 'AI_CANCELLED' });
    const broken = createAiProvider({ userDataPath: await fixture(), vault: { isEncryptionAvailable: () => { throw new Error('no vault'); }, encryptString: () => Buffer.alloc(0), decryptString: () => '' } });
    expect((await broken.getStatus()).vaultReason).toBe('unavailable');
  });

  it('creates private random temporary state files and rejects unsafe keys', async () => {
    const directory = await fixture(); const provider = createAiProvider({ userDataPath: directory, vault: vault() });
    expect(await provider.saveConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' })).toEqual({ ok: true });
    expect((await lstat(join(directory, 'ai-provider.json'))).mode & 0o077).toBe(0);
    expect(await provider.storeKey('bad key')).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
    expect(await provider.storeKey('bad\nkey')).toEqual({ ok: false, code: 'AI_CONTEXT_REJECTED' });
  });
});
