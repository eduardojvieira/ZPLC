import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { CONTRAST_PAIRS, THEME_IDS, contrastResults } from '../theme/tokens';
import { SIGNAL_TONES } from '../theme/signalTone';

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

/** UX-027: the three visual editors are drawn from tokens only, so they follow the light, dark and high-contrast themes. */
describe('visual editors in every theme (UX-027)', () => {
  const declared = (fg: string, bg: string) => CONTRAST_PAIRS.some((pair) => pair.fg === fg && pair.bg === bg);

  it('UX-027 declares the contrast of the text, the muted labels and every signal state on the canvas and on a node', () => {
    for (const bg of ['--visual-canvas', '--visual-node', '--visual-panel']) {
      for (const fg of ['--text-primary', '--text-secondary', '--visual-muted', ...SIGNAL_TONES.map((tone) => `--signal-${tone}-fg`)]) {
        expect({ fg, bg, declared: declared(fg, bg) }).toEqual({ fg, bg, declared: true });
      }
    }
  });

  for (const theme of THEME_IDS) {
    it(`UX-027 holds every declared contrast of the visual editor surfaces in the ${theme} theme`, () => {
      const failed = contrastResults(theme)
        .filter(({ pair }) => pair.bg === '--visual-canvas' || pair.bg === '--visual-node' || pair.bg === '--visual-panel')
        .filter(({ ok }) => !ok)
        .map(({ pair, ratio }) => `${pair.fg} on ${pair.bg}: ${ratio.toFixed(2)}`);
      expect(failed).toEqual([]);
    });
  }

  it('UX-027 keeps no stock colour, literal colour, glow or focus override in a visual editor source', () => {
    const listed = JSON.parse(readFileSync(join(import.meta.dir, '../../../../tools/ci/ui-kit-offenders.json'), 'utf8')) as Array<{ file: string; rule: string }>;
    const rules = ['stock-palette', 'literal-colour', 'editor-effect', 'focus-override'];
    expect(listed.filter(({ file, rule }) => file.includes('/src/editors/') && rules.includes(rule))).toEqual([]);
  });
});
