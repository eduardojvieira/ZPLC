import { describe, expect, it } from 'bun:test';
import { disposeClosedEditorModels, editorModelPath, isEditorModelClosed, isMonacoCancellation } from './editorModels';

/** The path Monaco reports in `model.uri.path` for a path it was given as a string. */
function monacoUriPath(path: string): { scheme: string; path: string } {
  const url = new URL(path);
  return { scheme: url.protocol.slice(0, -1), path: decodeURIComponent(url.pathname) };
}

describe('editor model paths', () => {
  it('derives a stable path per project session and file', () => {
    expect(editorModelPath(1, 'file:src/Motor.st')).toBe(editorModelPath(1, 'file:src/Motor.st'));
    expect(editorModelPath(1, 'file:src/Motor.st')).not.toBe(editorModelPath(1, 'file:src/Pump.st'));
    expect(editorModelPath(1, 'file:src/Motor.st')).not.toBe(editorModelPath(2, 'file:src/Motor.st'));
  });

  it('keeps ids with separators, queries and escapes distinct and inside the path', () => {
    const ids = ['file:src/a b.st', 'file:src/a#b.st', 'file:src/a?b.st', 'file:src/a%2Fb.st', 'file:src/a/b.st', 'file:src/ñ.st'];
    const paths = ids.map((id) => editorModelPath(3, id));
    expect(new Set(paths).size).toBe(ids.length);
    for (const [index, path] of paths.entries()) {
      const url = new URL(path);
      expect(url.search + url.hash).toBe('');
      expect(monacoUriPath(path).path).toBe(`/3/${ids[index]}`);
    }
  });
});

describe('closed editor models', () => {
  const open = ['file:src/Motor.st', 'file:src/Pump.st'];

  it('keeps the models of open tabs in the current project session', () => {
    for (const id of open) expect(isEditorModelClosed(monacoUriPath(editorModelPath(4, id)), 4, open)).toBe(false);
  });

  it('closes the model of a tab that is no longer open', () => {
    expect(isEditorModelClosed(monacoUriPath(editorModelPath(4, 'file:src/Old.st')), 4, open)).toBe(true);
  });

  it('closes a model left over from an earlier project session even when the same file is open now', () => {
    expect(isEditorModelClosed(monacoUriPath(editorModelPath(3, 'file:src/Motor.st')), 4, open)).toBe(true);
  });

  it('never touches models that Studio did not create', () => {
    expect(isEditorModelClosed({ scheme: 'inmemory', path: '/model/1' }, 4, open)).toBe(false);
    expect(isEditorModelClosed({ scheme: 'file', path: '/4/file:src/Old.st' }, 4, open)).toBe(false);
  });

  it('disposes only the closed models of the host', () => {
    const disposed: string[] = [];
    const model = (path: string) => ({
      uri: monacoUriPath(path),
      dispose: () => {
        disposed.push(path);
      },
    });
    const keep = editorModelPath(4, 'file:src/Motor.st');
    const drop = editorModelPath(4, 'file:src/Old.st');
    const stale = editorModelPath(2, 'file:src/Pump.st');
    disposeClosedEditorModels({ getModels: () => [model(keep), model(drop), model(stale)] }, 4, open);
    expect(disposed).toEqual([drop, stale]);
  });
});

describe('Monaco cancellation', () => {
  it('recognizes only the error Monaco uses for cancelled work', () => {
    const cancellation = Object.assign(new Error('Canceled'), { name: 'Canceled' });
    expect(isMonacoCancellation(cancellation)).toBe(true);
    expect(isMonacoCancellation(new Error('Canceled'))).toBe(false);
    expect(isMonacoCancellation(Object.assign(new Error('Cancelled by user'), { name: 'Canceled' }))).toBe(false);
    expect(isMonacoCancellation('Canceled')).toBe(false);
    expect(isMonacoCancellation(undefined)).toBe(false);
  });
});
