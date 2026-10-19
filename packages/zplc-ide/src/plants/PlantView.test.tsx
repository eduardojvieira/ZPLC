import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { auditMarkup } from '../ui/audit';
import { PLANT_KINDS, createPlantRun } from './plantEngine';
import { PlantView } from './PlantView';

const render = (kind: (typeof PLANT_KINDS)[number], reads: Record<string, boolean> = {}, act?: string) => {
  const run = createPlantRun(kind);
  if (act) run.act(act);
  return renderToStaticMarkup(<PlantView kind={kind} state={run.state} reads={reads} sensed={run.sense()} />);
};

describe('plant schematics (LRN-018, LRN-037)', () => {
  it('draw each of the four plants as an image whose name is the text equivalent of its state', () => {
    for (const kind of PLANT_KINDS) {
      const html = render(kind);
      expect(html).toContain(`data-plant="${kind}"`);
      expect(html).toContain('role="img"');
      expect(html).toMatch(/aria-label="Plant drawing: [^"]+\./);
      expect(html).toContain('data-plant-fact="plant.');
      expect(auditMarkup(html)).toEqual([]);
    }
  });

  it('shows every lamp as a glyph and a word, and a fault in the fault state, never colour alone', () => {
    const html = render('motor-v1', { command: true }, 'stall');
    expect(html).toContain('● COMMAND ON');
    expect(html).toContain('○ AT SPEED OFF');
    expect(html).toContain('▲ STALL FAULT');
    expect(html).toContain('data-signal="fault"');
    expect(html).not.toMatch(/animate|filter|glow/i);
  });
});
