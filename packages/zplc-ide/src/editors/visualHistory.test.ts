import { describe, expect, it } from 'bun:test';
import {
  GESTURE_COALESCE_MS,
  recordVisualSnapshot,
  redoVisualSnapshot,
  undoVisualSnapshot,
  VISUAL_HISTORY_LIMIT,
  type VisualHistories,
} from './visualHistory';

describe('visual snapshot history (LNG-010)', () => {
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
    expect(recordVisualSnapshot(histories, key, 'D', 'D').history).toBe(histories.get(key)!);

    let content = '0';
    histories = new Map();
    for (let value = 1; value <= VISUAL_HISTORY_LIMIT + 2; value++) {
      const next = String(value);
      histories = recordVisualSnapshot(histories, key, content, next).histories;
      content = next;
    }
    // the snapshot before the first gesture, and one for each gesture that can be undone
    expect(histories.get(key)?.snapshots).toHaveLength(VISUAL_HISTORY_LIMIT + 1);
    expect(histories.get(key)?.snapshots[0]).toBe('2');
  });

  it('resets stale external content and isolates project sessions and files', () => {
    let histories = recordVisualSnapshot(new Map(), key, 'A', 'B').histories;
    expect(undoVisualSnapshot(histories, key, 'external').content).toBeUndefined();
    histories = recordVisualSnapshot(histories, key, 'external', 'C').histories;
    expect(undoVisualSnapshot(histories, key, 'C').content).toBe('external');
    expect(undoVisualSnapshot(histories, '8:diagram', 'A').content).toBeUndefined();
    expect(undoVisualSnapshot(histories, '7:other', 'A').content).toBeUndefined();
  });

  // LNG-010: "the undo history MUST hold at least 100 gestures"
  it('holds at least 100 gestures: 100 undo steps after 150 gestures', () => {
    expect(VISUAL_HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
    let histories: VisualHistories = new Map();
    let content = 'doc 0';
    for (let gesture = 1; gesture <= 150; gesture++) {
      const next = `doc ${gesture}`;
      histories = recordVisualSnapshot(histories, key, content, next).histories;
      content = next;
    }
    let undone = 0;
    for (;;) {
      const step = undoVisualSnapshot(histories, key, content);
      if (step.content === undefined) break;
      histories = step.histories;
      content = step.content;
      undone += 1;
    }
    expect(undone).toBe(100);
    expect(content).toBe('doc 50');
  });

  it('gives the selection back with the content: undo the one from before the gesture, redo the one from after', () => {
    const selection = { before: ['block:and_1'], after: ['block:and_1', 'block:or_2'] };
    let histories = recordVisualSnapshot(new Map(), key, 'A', 'B', { selection }).histories;
    const undo = undoVisualSnapshot(histories, key, 'B');
    expect(undo.content).toBe('A');
    expect(undo.selection).toEqual(['block:and_1']);
    histories = undo.histories;
    const redo = redoVisualSnapshot(histories, key, 'A');
    expect(redo.content).toBe('B');
    expect(redo.selection).toEqual(['block:and_1', 'block:or_2']);
  });

  it('a step of a gesture that remembered no selection says none', () => {
    const histories = recordVisualSnapshot(new Map(), key, 'A', 'B').histories;
    expect(undoVisualSnapshot(histories, key, 'B').selection).toBeUndefined();
  });

  it('edits of one field that follow one another are one entry, and another field is another', () => {
    const at = 10_000;
    let histories = recordVisualSnapshot(new Map(), key, 'a', 'ab', {
      coalesce: 'name:s1',
      at,
      selection: { before: ['step:s1'], after: ['step:s1'] },
    }).histories;
    histories = recordVisualSnapshot(histories, key, 'ab', 'abc', {
      coalesce: 'name:s1',
      at: at + 200,
      selection: { before: ['step:s1'], after: ['step:s1'] },
    }).histories;
    histories = recordVisualSnapshot(histories, key, 'abc', 'abcd', { coalesce: 'name:s1', at: at + 400 }).histories;
    expect(histories.get(key)?.snapshots).toEqual(['a', 'abcd']);
    histories = recordVisualSnapshot(histories, key, 'abcd', 'abcd!', { coalesce: 'condition:t1', at: at + 500 }).histories;
    expect(histories.get(key)?.snapshots).toEqual(['a', 'abcd', 'abcd!']);
    const undo = undoVisualSnapshot(histories, key, 'abcd!');
    expect(undo.content).toBe('abcd');
    expect(undoVisualSnapshot(undo.histories, key, 'abcd').content).toBe('a');
  });

  it('edits of one field that are far apart in time are not one entry', () => {
    const at = 10_000;
    let histories = recordVisualSnapshot(new Map(), key, 'a', 'ab', { coalesce: 'name:s1', at }).histories;
    histories = recordVisualSnapshot(histories, key, 'ab', 'abc', { coalesce: 'name:s1', at: at + GESTURE_COALESCE_MS + 1 }).histories;
    expect(histories.get(key)?.snapshots).toEqual(['a', 'ab', 'abc']);
  });

  it('an edit without a key is never merged, so each gesture of a drag, paste or delete is its own entry', () => {
    let histories = recordVisualSnapshot(new Map(), key, 'a', 'b', { at: 1 }).histories;
    histories = recordVisualSnapshot(histories, key, 'b', 'c', { at: 2 }).histories;
    expect(histories.get(key)?.snapshots).toEqual(['a', 'b', 'c']);
  });
});
