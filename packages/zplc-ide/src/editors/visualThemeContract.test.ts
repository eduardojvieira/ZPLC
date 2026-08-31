import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const files = [
  'fbd/FBDEditor.tsx', 'fbd/FBDToolbox.tsx', 'fbd/InstanceMonitor.tsx', 'fbd/edges/DebugEdge.tsx',
  'fbd/nodes/VariableNode.tsx', 'fbd/nodes/LogicGateNode.tsx', 'fbd/nodes/ConstantNode.tsx', 'fbd/nodes/ComparisonNode.tsx', 'fbd/nodes/MathNode.tsx', 'fbd/nodes/FunctionBlockNode.tsx', 'fbd/nodes/NodeComment.tsx',
  'ld/LDEditor.tsx', 'ld/LDElement.tsx', 'sfc/SFCEditor.tsx', 'sfc/SFCToolbox.tsx', 'sfc/nodes/SFCStepNode.tsx', 'sfc/nodes/SFCTransitionNode.tsx',
];

describe('visual editor theme contract', () => {
  it('uses the shared visual wrappers and no slate surface utilities on the visible path', () => {
    const root = join(import.meta.dir);
    const source = files.map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
    expect(source).toContain('zplc-visual-editor');
    expect(source).toContain('zplc-visual-toolbox');
    expect(source).toContain('zplc-visual-node');
    expect(source).toContain('zplc-visual-card');
    expect(source).not.toMatch(/(?:bg|text|border)-slate-|#1e293b|#64748b|bg-black/);
    expect(source).not.toContain("valueFalse: '#ef4444'");
  });
});
