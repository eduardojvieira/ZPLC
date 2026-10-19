import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { auditMarkup } from '../ui/audit';
import { PlantLivePanel } from './PlantLivePanel';

describe('the live plant panel (LRN-018)', () => {
  it('says why there is no plant yet instead of drawing a fabricated one', () => {
    const html = renderToStaticMarkup(<PlantLivePanel controller={undefined} />);
    expect(html).toContain('aria-label="Live plant"');
    expect(html).toContain('Start the simulation to run a plant in closed loop.');
    expect(html).not.toContain('data-plant=');
    expect(auditMarkup(html)).toEqual([]);
  });
});
