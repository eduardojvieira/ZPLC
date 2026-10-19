// UX-033: alignment and distribution of the selected nodes of a diagram, as one gesture (LNG-010).
import { describe, expect, it } from 'bun:test';
import type { Node } from '@xyflow/react';
import { ARRANGE_COMMANDS, arrangeReason, arrangeSelection } from './arrange';

const node = (id: string, x: number, y: number, width: number, height: number, selected = true): Node =>
  ({ id, type: 'x', position: { x, y }, measured: { width, height }, selected, data: {} });
const at = (nodes: Node[], id: string) => nodes.find((candidate) => candidate.id === id)!.position;

describe('aligning the selected nodes (UX-033)', () => {
  const nodes = [node('a', 100, 40, 60, 20), node('b', 30, 90, 120, 40), node('c', 200, 10, 80, 30), node('far', 900, 900, 50, 50, false)];

  it('aligns the left edges to the leftmost, the right edges to the rightmost, and the centres to the middle of the group', () => {
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignLeft').nodes, id).x)).toEqual([30, 30, 30]);
    // the right edge of the group is that of c: 200 + 80 = 280
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignRight').nodes, id).x)).toEqual([220, 160, 200]);
    // the group spans 30 to 280, so the centre line is 155
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignCenter').nodes, id).x)).toEqual([125, 95, 115]);
  });

  it('aligns the top edges, the bottom edges and the middles the same way on the vertical axis', () => {
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignTop').nodes, id).y)).toEqual([10, 10, 10]);
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignBottom').nodes, id).y)).toEqual([110, 90, 100]);
    // the group spans 10 to 130, so the middle line is 70
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(nodes, 'alignMiddle').nodes, id).y)).toEqual([60, 50, 55]);
  });

  it('moves nothing that is not selected, and says what it did', () => {
    const result = arrangeSelection(nodes, 'alignLeft');
    expect(result.changed).toBe(true);
    expect(at(result.nodes, 'far')).toEqual({ x: 900, y: 900 });
    expect(result.nodes.find((candidate) => candidate.id === 'far')).toBe(nodes[3]!);
    expect(result.say).toContain('3');
  });

  it('reports nothing changed when the nodes are already aligned', () => {
    const aligned = arrangeSelection(nodes, 'alignLeft').nodes;
    const again = arrangeSelection(aligned, 'alignLeft');
    expect(again.changed).toBe(false);
    expect(again.refused).toBeUndefined();
    expect(again.say.length).toBeGreaterThan(0);
  });
});

describe('distributing the selected nodes (UX-033)', () => {
  it('leaves equal gaps between the boxes from the first to the last, in the order they lie in', () => {
    const nodes = [node('a', 0, 0, 40, 10), node('b', 50, 0, 100, 10), node('c', 160, 0, 20, 10), node('d', 400, 0, 40, 10)];
    const result = arrangeSelection(nodes, 'distributeHorizontally').nodes;
    // the span is 0 to 440, the widths add to 200, so each of the three gaps is 80
    expect(['a', 'b', 'c', 'd'].map((id) => at(result, id).x)).toEqual([0, 120, 300, 400]);
    const vertical = [node('a', 0, 0, 10, 40), node('b', 0, 20, 10, 20), node('c', 0, 300, 10, 20)];
    // the span is 0 to 320, the heights add to 80, so each of the two gaps is 120
    expect(['a', 'b', 'c'].map((id) => at(arrangeSelection(vertical, 'distributeVertically').nodes, id).y)).toEqual([0, 160, 300]);
  });
});

describe('what the commands refuse and why (UX-033)', () => {
  it('needs two selected nodes to align and three to distribute, and says so', () => {
    const one = [node('a', 0, 0, 10, 10), node('b', 50, 0, 10, 10, false)];
    for (const command of ARRANGE_COMMANDS) {
      const result = arrangeSelection(one, command);
      expect(result.refused).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.nodes).toBe(one);
      expect(result.say).toBe(arrangeReason(1, command)!);
    }
    expect(arrangeReason(2, 'alignLeft')).toBeUndefined();
    expect(arrangeReason(2, 'distributeHorizontally')).toBeDefined();
    expect(arrangeReason(3, 'distributeHorizontally')).toBeUndefined();
    expect(arrangeSelection([node('a', 0, 0, 10, 10), node('b', 5, 5, 10, 10)], 'distributeVertically').refused).toBe(true);
  });
});
