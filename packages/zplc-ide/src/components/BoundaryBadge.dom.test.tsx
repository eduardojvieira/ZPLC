import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { VOCABULARY } from '../i18n/vocabulary';

// MSG-003: the boundary of a result is stated once, as a badge, and the full claim is in its tooltip.
const dom = await setupDom();
const { BoundaryBadge } = await import('./BoundaryBadge');
const { TestVerdict } = await import('./TestVerdict');

describe('the boundary badge (MSG-003)', () => {
  it('MSG-003 a result states its boundary once', () => {
    dom.render(<TestVerdict sentence="1 of 1 tests passed" ok boundary="simulation" />);
    expect(dom.screen.getAllByText(VOCABULARY.resultSimulation.en)).toHaveLength(1);
    // the old statements of the boundary are gone
    expect(dom.screen.queryByText('Host evidence only')).toBeNull();
    expect(dom.screen.queryByText('Native POSIX host evidence — not hardware or HIL evidence.')).toBeNull();
  });

  it('MSG-003 the tooltip carries the full claim', async () => {
    const { user } = dom.render(<BoundaryBadge boundary="simulation" />);
    await user.tab();
    const tooltip = await dom.screen.findByRole('tooltip');
    // what 2.0 claimed, no more (P6): a simulation result is not evidence of a lamp, of hardware timing, of HIL or of certification
    expect(tooltip.textContent).toContain('not evidence of a physical lamp, hardware timing, HIL, or certification');
    expect(tooltip.textContent).not.toMatch(/hardware evidence|certified|verified on/i);
  });

  it('MSG-003 the label and the Spanish label are the words of the vocabulary, and a board result says so', () => {
    dom.render(<BoundaryBadge boundary="board" />);
    expect(dom.screen.getByText(dom.t('u2Tests.boundary.board'))).toBeTruthy();
    expect(dom.t('u2Tests.boundary.simulation')).toBe(VOCABULARY.resultSimulation.en);
    expect(dom.tFor('es')('u2Tests.boundary.simulation')).toBe(VOCABULARY.resultSimulation.es);
    expect(dom.t('u2Tests.boundary.board')).toBe(VOCABULARY.resultBoard.en);
  });
});
