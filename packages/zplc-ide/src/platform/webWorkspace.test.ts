import { describe, expect, test } from 'bun:test';
import { newProjectConfig, newProjectProgram, SIMULATION_TARGET } from '../project/newProject';
import { presentWorkspaceCompileResult } from '../components/workspaceTestPresentation';
import { compileWebWorkspace } from './webWorkspace';

class FakeFile {
  readonly kind = 'file' as const;
  constructor(
    readonly name: string,
    readonly bytes: Uint8Array,
  ) {}
  async getFile() {
    const bytes = this.bytes;
    return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }
}
class FakeDir {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDir | FakeFile>();
  constructor(readonly name: string) {}
  async getDirectoryHandle(name: string) {
    const found = this.children.get(name);
    if (found?.kind === 'directory') return found;
    throw Object.assign(new Error('x'), { name: 'NotFoundError' });
  }
  async getFileHandle(name: string) {
    const found = this.children.get(name);
    if (found?.kind === 'file') return found;
    throw Object.assign(new Error('x'), { name: 'NotFoundError' });
  }
  async *values() {
    yield* this.children.values();
  }
  put(path: string, text: string): FakeDir {
    const parts = path.split('/');
    let dir = this as FakeDir;
    for (const part of parts.slice(0, -1)) {
      let next = dir.children.get(part);
      if (!next) {
        next = new FakeDir(part);
        dir.children.set(part, next);
      }
      dir = next as FakeDir;
    }
    dir.children.set(parts.at(-1)!, new FakeFile(parts.at(-1)!, new TextEncoder().encode(text)));
    return this;
  }
}

function project(program: string): FakeDir {
  const config = newProjectConfig('Pump', { target: SIMULATION_TARGET, language: 'ST' });
  return new FakeDir('Pump').put('zplc.json', JSON.stringify(config)).put(`src/${newProjectProgram('Pump', 'ST').fileName}`, program);
}
const asRoot = (dir: FakeDir) => dir as unknown as FileSystemDirectoryHandle;
const GOOD =
  'PROGRAM Main\nVAR_OUTPUT Lamp AT %Q0.0 : BOOL; END_VAR\nVAR N : INT := 0; END_VAR\nN := N + 1;\nLamp := N > 5;\nEND_PROGRAM\n';

describe('the build of the web build (REL-037)', () => {
  test('REL-037: builds the open folder with the compiler of the application and answers in the shape the toolbar presents', async () => {
    const answer = await compileWebWorkspace(asRoot(project(GOOD)));
    const presented = presentWorkspaceCompileResult(answer);
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    expect(presented.summary.name).toBe('Pump');
    expect(presented.summary.taskCount).toBe(1);
    expect(presented.artifact.zplcFile.byteLength).toBeGreaterThan(16);
    expect(presented.zplcEvidence.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(presented.zplcEvidence.byteLength).toBe(presented.artifact.zplcFile.byteLength);
  });

  test('REL-037: a source with an error fails with the message, the line and the column of the compiler', async () => {
    const answer = await compileWebWorkspace(asRoot(project('PROGRAM Main\nVAR X : INT; END_VAR\nX := ;\nEND_PROGRAM\n')));
    const presented = presentWorkspaceCompileResult(answer);
    expect(presented.ok).toBe(false);
    if (presented.ok) return;
    expect(presented.diagnostics.length).toBeGreaterThan(0);
    expect(presented.diagnostics[0]!.message.length).toBeGreaterThan(3);
    expect(presented.diagnostics[0]!.line).toBe(3);
  });

  test('REL-037: a folder with no zplc.json, and a task whose program is not in src, fail with a diagnostic and no exception', async () => {
    const empty = presentWorkspaceCompileResult(await compileWebWorkspace(asRoot(new FakeDir('x'))));
    expect(empty.ok).toBe(false);
    const missing = new FakeDir('Pump')
      .put('zplc.json', JSON.stringify(newProjectConfig('Pump', { target: SIMULATION_TARGET, language: 'ST' })))
      .put('src/other.st', GOOD);
    const answer = (await compileWebWorkspace(asRoot(missing))) as { ok: boolean; evidence: { diagnostics: Array<{ code: string }> } };
    expect(answer.ok).toBe(false);
    expect(answer.evidence.diagnostics[0]!.code).toBe('PROGRAM_NOT_FOUND');
  });
});
