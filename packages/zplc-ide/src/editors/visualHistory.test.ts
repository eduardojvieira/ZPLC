import { describe, expect, it } from 'bun:test';
import { recordVisualSnapshot, redoVisualSnapshot, undoVisualSnapshot, VISUAL_HISTORY_LIMIT, type VisualHistories } from './visualHistory';

describe('visual snapshot history', () => {
  const key = '7:diagram';

  it('undoes and redoes A → B → C', () => {
    let histories: VisualHistories = new Map();
    histories = recordVisualSnapshot(histories, key, 'A', 'B').histories;
    histories = recordVisualSnapshot(histories, key, 'B', 'C').histories;
    const undo = undoVisualSnapshot(histories, key, 'C');
    expect(undo.content).toBe('B');
    const redo = redoVisualSnapshot(undo.histories, key, 'B');
    expect(redo.content).toBe('C');
  });

  it('truncates redo, ignores duplicate snapshots, and caps the session history', () => {
    let histories = recordVisualSnapshot(new Map(), key, 'A', 'B').histories;
    histories = recordVisualSnapshot(histories, key, 'B', 'C').histories;
    const undo = undoVisualSnapshot(histories, key, 'C');
    histories = recordVisualSnapshot(undo.histories, key, 'B', 'D').histories;
    expect(redoVisualSnapshot(histories, key, 'D').content).toBeUndefined();
    expect(recordVisualSnapshot(histories, key, 'D', 'D').history).toBe(histories.get(key));

    let content = '0';
    histories = new Map();
    for (let value = 1; value <= VISUAL_HISTORY_LIMIT + 2; value++) {
      const next = String(value);
      histories = recordVisualSnapshot(histories, key, content, next).histories;
      content = next;
    }
    expect(histories.get(key)?.snapshots).toHaveLength(VISUAL_HISTORY_LIMIT);
    expect(histories.get(key)?.snapshots[0]).toBe('3');
  });

  it('resets stale external content and isolates project sessions and files', () => {
    let histories = recordVisualSnapshot(new Map(), key, 'A', 'B').histories;
    expect(undoVisualSnapshot(histories, key, 'external').content).toBeUndefined();
    histories = recordVisualSnapshot(histories, key, 'external', 'C').histories;
    expect(undoVisualSnapshot(histories, key, 'C').content).toBe('external');
    expect(undoVisualSnapshot(histories, '8:diagram', 'A').content).toBeUndefined();
    expect(undoVisualSnapshot(histories, '7:other', 'A').content).toBeUndefined();
  });
});
