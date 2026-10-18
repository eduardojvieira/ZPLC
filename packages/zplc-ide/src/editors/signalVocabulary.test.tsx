import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { SIGNAL_CUES, SIGNAL_TONES, type SignalTone } from '../theme/signalTone';
import type { DebugValueResult } from '../hooks/useDebugValue';
import type { LDElement as LDElementModel } from '../models/ld';
import LDElement, { type DebugValuesMap } from './ld/LDElement';
import FunctionBlockNode from './fbd/nodes/FunctionBlockNode';
import SFCStepNode from './sfc/nodes/SFCStepNode';
import SFCTransitionNode from './sfc/nodes/SFCTransitionNode';
import { edgeSignal } from './fbd/edges/edgeSignal';

/**
 * UX-009: the five states of the signal vocabulary reach Ladder, FBD and SFC, and each one is drawn with the colour of
 * its `--signal-*` token AND a cue that is not colour: a glyph and a word. TRUE, FALSE, unknown, forced and fault are
 * the states the brief names; the plain value tone is checked for numbers.
 */
const FIVE = ['true', 'false', 'unknown', 'forced', 'fault'] as const satisfies readonly SignalTone[];

const STOCK_STATE_COLOURS = /--color-accent-green|#22c55e|#ef4444|rgba\(34, 197, 94|(?:text|bg|border|ring|shadow|from|to)-(?:green|red|emerald|rose|lime)-\d|drop-shadow/i;

const sample = (over: Partial<DebugValueResult> & { forced?: boolean }): DebugValueResult & { forced?: boolean } => ({
  value: false, type: 'BOOL', address: 0, region: null, size: 1, loading: false, exists: true, error: null, ...over,
});

const LD_SAMPLES: Record<(typeof FIVE)[number], DebugValueResult & { forced?: boolean }> = {
  true: sample({ value: true }),
  false: sample({ value: false }),
  unknown: sample({ value: null }),
  forced: sample({ value: false, forced: true }),
  fault: sample({ value: true, error: 'The variable cannot be read' }),
};

const contact: LDElementModel = { id: 'c1', type: 'contact_no', variable: 'Start', row: 0, col: 0 };
const coil: LDElementModel = { id: 'k1', type: 'coil', variable: 'Motor', row: 0, col: 1 };

const ldMarkup = (element: LDElementModel, tone: (typeof FIVE)[number], energized = false): string =>
  renderToStaticMarkup(
    <svg>
      <LDElement element={element} x={0} y={0} energized={energized} debugValues={new Map([[element.variable!, LD_SAMPLES[tone]]]) as DebugValuesMap} />
    </svg>,
  );

describe('UX-009 Ladder shows the five signal states', () => {
  for (const tone of FIVE) {
    for (const [name, element] of [['contact', contact], ['coil', coil]] as const) {
      it(`UX-009 draws a ${tone} ${name} with the ${tone} token and its glyph`, () => {
        const markup = ldMarkup(element, tone);
        expect(markup).toContain(`var(--signal-${tone}-fg)`);
        expect(markup).toContain(SIGNAL_CUES[tone].glyph);
        expect(markup).toContain(`data-signal="${tone}"`);
        expect(markup).not.toMatch(STOCK_STATE_COLOURS);
      });
    }
  }

  it('UX-009 draws power flow as a heavier line in the TRUE token, without a glow', () => {
    const idle = ldMarkup(contact, 'false', false);
    const flowing = ldMarkup(contact, 'true', true);
    expect(flowing).toContain('stroke="var(--signal-true-border)"');
    expect(flowing).toMatch(/stroke="var\(--signal-true-border\)"[^>]*stroke-width="3"/);
    expect(idle).not.toContain('--signal-true-border');
    expect(idle).toContain('stroke-width="2"');
    expect(flowing).not.toContain('fill-opacity');
    expect(flowing.match(/<rect/g)?.length).toBe(idle.match(/<rect/g)?.length);
  });

  it('UX-009 keeps a number in the plain value tone, with no state glyph', () => {
    const markup = renderToStaticMarkup(
      <svg><LDElement element={contact} x={0} y={0} debugValues={new Map([['Start', sample({ type: 'INT', value: 42 })]]) as DebugValuesMap} /></svg>,
    );
    expect(markup).toContain('var(--signal-value-fg)');
    expect(markup).toContain('data-signal="value"');
    expect(markup).not.toContain(SIGNAL_CUES.true.glyph);
  });
});

const nodeProps = (id: string, data: Record<string, unknown>) => ({ id, selected: false, data }) as unknown as NodeProps;
const flow = (node: React.ReactElement) => renderToStaticMarkup(<ReactFlowProvider>{node}</ReactFlowProvider>);
const fbNode = (pinValues: Record<string, boolean | undefined>, pinFlags: Record<string, { forced?: boolean; fault?: boolean }> = {}) =>
  flow(<FunctionBlockNode {...nodeProps('b1', { type: 'TON', instanceName: 'T1', debugActive: true, pinValues, pinFlags })} />);

const FBD_PINS: Record<(typeof FIVE)[number], string> = {
  true: fbNode({ Q: true }),
  false: fbNode({ Q: false }),
  unknown: fbNode({ Q: undefined }),
  forced: fbNode({ Q: false }, { Q: { forced: true } }),
  fault: fbNode({ Q: true }, { Q: { fault: true } }),
};

describe('UX-009 FBD shows the five signal states', () => {
  for (const tone of FIVE) {
    it(`UX-009 shows a ${tone} output pin with its token, glyph and word`, () => {
      const markup = FBD_PINS[tone];
      expect(markup).toContain(`data-signal="${tone}"`);
      expect(markup).toContain(`var(--signal-${tone}-fg)`);
      expect(markup).toContain(SIGNAL_CUES[tone].glyph);
      expect(markup).not.toMatch(STOCK_STATE_COLOURS);
    });
  }

  for (const tone of FIVE) {
    it(`UX-009 tells the wire of a ${tone} value apart by dash, weight and label as well as colour`, () => {
      const value = { true: true, false: false, unknown: null, forced: false, fault: true }[tone];
      const edge = edgeSignal({ liveValue: value, dataType: 'BOOL', debugActive: true, forced: tone === 'forced', fault: tone === 'fault' });
      expect(edge.tone).toBe(tone);
      expect(edge.stroke).toBe(tone === 'false' || tone === 'unknown' ? 'var(--visual-wire)' : `var(--signal-${tone}-border)`);
      expect(edge.label).toContain(SIGNAL_CUES[tone].glyph);
      expect(edge.dash === undefined).toBe(tone !== 'unknown');
      expect(edge.width).toBe(tone === 'true' || tone === 'forced' || tone === 'fault' ? 3 : 2);
    });
  }

  it('UX-009 does not call a non-zero number a confirmed TRUE on the wire', () => {
    const edge = edgeSignal({ liveValue: 7, dataType: 'INT', debugActive: true });
    expect(edge.tone).toBe('value');
    expect(edge.stroke).toBe('var(--visual-wire)');
  });
});

const step = (data: Record<string, unknown>) => flow(<SFCStepNode {...nodeProps('s1', { name: 'Fill', isInitial: false, debugActive: true, ...data })} />);
const transition = (data: Record<string, unknown>) => flow(<SFCTransitionNode {...nodeProps('t1', { condition: 'Full', debugActive: true, isArmed: true, ...data })} />);

const SFC: Record<(typeof FIVE)[number], { step: Record<string, unknown>; transition: Record<string, unknown> }> = {
  true: { step: { isActive: true }, transition: { conditionResult: true } },
  false: { step: { isActive: false }, transition: { conditionResult: false } },
  unknown: { step: { stateUnavailable: true }, transition: {} },
  forced: { step: { isActive: false, forced: true }, transition: { conditionResult: false, forced: true } },
  fault: { step: { isActive: true, fault: true }, transition: { conditionResult: true, fault: true } },
};

describe('UX-009 SFC shows the five signal states', () => {
  for (const tone of FIVE) {
    it(`UX-009 shows a ${tone} step with its token, glyph and word`, () => {
      const markup = step(SFC[tone].step);
      expect(markup).toContain(`data-signal="${tone}"`);
      expect(markup).toContain(`var(--signal-${tone}-fg)`);
      expect(markup).toContain(SIGNAL_CUES[tone].glyph);
      expect(markup).not.toMatch(STOCK_STATE_COLOURS);
      expect(markup).not.toContain('animate-pulse');
    });

    it(`UX-009 shows a ${tone} transition condition with its token, glyph and word`, () => {
      const markup = transition(SFC[tone].transition);
      expect(markup).toContain(`data-signal="${tone}"`);
      expect(markup).toContain(`var(--signal-${tone}-fg)`);
      expect(markup).toContain(SIGNAL_CUES[tone].glyph);
      expect(markup).not.toMatch(STOCK_STATE_COLOURS);
    });
  }

  it('UX-009 says ACTIVE, IDLE and UNAVAILABLE for a step in words as well as in the tone', () => {
    expect(step(SFC.true.step)).toContain('ACTIVE');
    expect(step(SFC.false.step)).toContain('IDLE');
    expect(step(SFC.unknown.step)).toContain('UNAVAILABLE');
  });
});

describe('UX-009 the visual editors carry no private on/off colours', () => {
  // pinned source: the editors have no renderer for every branch (minimap colours, handles), so the sources are scanned
  const sources = ['ld/LDElement.tsx', 'ld/LDRungGrid.tsx', 'ld/LDEditor.tsx', 'sfc/SFCEditor.tsx', 'sfc/nodes/SFCStepNode.tsx', 'sfc/nodes/SFCTransitionNode.tsx', 'fbd/FBDEditor.tsx', 'fbd/InstanceMonitor.tsx', 'fbd/edges/DebugEdge.tsx', 'fbd/edges/edgeSignal.ts', 'fbd/nodes/FunctionBlockNode.tsx']
    .map((file) => [file, readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')] as const);

  for (const [file, text] of sources) {
    it(`UX-009 ${file} uses no stock green or red, no hex state colour and no accent for a value`, () => {
      expect(text.match(STOCK_STATE_COLOURS)).toBeNull();
      expect(text).not.toMatch(/#(?:22c55e|f59e0b|fbbf24|22d3ee|EF4444)\b/i);
    });
  }

  it('UX-009 names every state once, in SIGNAL_TONES', () => {
    expect([...SIGNAL_TONES].map(String).sort()).toEqual([...FIVE, 'value'].map(String).sort());
  });
});
