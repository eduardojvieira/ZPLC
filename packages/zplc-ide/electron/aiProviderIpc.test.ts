import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const main = readFileSync(path.join(electronDir, 'main.ts'), 'utf8');
const preload = readFileSync(path.join(electronDir, 'preload.ts'), 'utf8');

describe('AI provider IPC boundary', () => {
  it('exposes exactly the opt-in provider surface and routes requests through the opaque workspace gateway', () => {
    for (const channel of ['ai-provider:get-status', 'ai-provider:get-config', 'ai-provider:save-config', 'ai-provider:store-key', 'ai-provider:clear-key', 'ai-provider:request', 'ai-provider:cancel']) {
      expect(main).toContain(channel); expect(preload).toContain(channel);
    }
    expect(main).toContain('isAllowedAiProviderRequest(request)');
    expect(main).toContain('workspaceTestGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, (root, options) => aiProvider!.request(root, request, options.signal))');
    expect(main).toContain('const provider = aiProvider.cancel(); const workspace = workspaceTestGateway.cancel(owner.ownerId);');
    expect(main).toContain('return { requested: provider.requested || workspace.requested };');
    expect(main).toContain('const result = await aiProvider.getStatus(); if (!rendererOwnerIsCurrent(owner)) throw new Error(\'Request denied\'); return result;');
    expect(main).toContain('const result = await aiProvider.getConfig(); if (!rendererOwnerIsCurrent(owner)) throw new Error(\'Request denied\'); return result;');
    expect(main).toContain('aiProvider?.cancel();');
    expect(preload).toContain('aiProvider: {');
    for (const forbidden of ['ai-provider:flash', 'ai-provider:deploy', 'ai-provider:force', 'ai-provider:run', 'ai-provider:stop', 'ai-provider:serial', 'ai-provider:shell', 'safeStorage', 'getPath(']) {
      expect(preload.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
