/**
 * The declared-interlock coverage view (IDE-032), rendered: what it says before a check, while one runs, when one is
 * not possible, and what it shows of the answer.
 */
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { InterlockCoverage } from './InterlockCoverage';
import type { WorkspaceSafetyPresentation } from './workspaceSafetyPresentation';

const render = (props: Partial<Parameters<typeof InterlockCoverage>[0]> = {}) => renderToStaticMarkup(
  <InterlockCoverage availability="ready" state="idle" busy={false} onCheck={() => undefined} {...props} />,
);
const pair = (a: string, b: string) => ({ outputs: [a, b] as [string, string] });
const covered = (declared: ReturnType<typeof pair>[], uncovered: ReturnType<typeof pair>[]): WorkspaceSafetyPresentation => (
  { kind: uncovered.length > 0 ? 'uncovered' : 'covered', declared, covered: declared.filter((entry) => !uncovered.includes(entry)), uncovered, diagnostics: [] } as unknown as WorkspaceSafetyPresentation
);

describe('InterlockCoverage', () => {
  it('has its title, a check button and the claim it does not make', () => {
    const html = render();
    expect(html).toContain('Declared interlock coverage');
    expect(html).toContain('Check declared interlocks');
    expect(html).toContain('Checks exact NEVER coverage in saved scenarios. It does not establish physical safety, timing, or certification.');
    expect(html).not.toContain('disabled=""');
  });

  it('cannot be run until the project is saved and linked, and says what to do', () => {
    expect(render({ availability: 'link-required' })).toContain('Save the project and choose zplc.json in Tests to check declared interlocks.');
    expect(render({ availability: 'unsaved' })).toContain('Save all changes before checking declared interlocks.');
    expect(render({ availability: 'desktop-unavailable' })).toContain('requires the desktop app');
    expect(render({ availability: 'project-required' })).toContain('Open a saved project folder');
    for (const availability of ['link-required', 'unsaved', 'desktop-unavailable', 'project-required'] as const) {
      expect(render({ availability })).toContain('disabled=""');
    }
  });

  it('shows progress, and disables the button while the workspace is in use', () => {
    expect(render({ state: 'running', busy: true })).toContain('Checking…');
    expect(render({ busy: true })).toContain('disabled=""');
  });

  it('says when the check could not be made', () => {
    expect(render({ state: 'unavailable' })).toContain('Declared interlock coverage is unavailable.');
  });

  it('lists each declared pair and whether a saved scenario asserts it with an exact NEVER', () => {
    const forwardReverse = pair('Motor.Forward', 'Motor.Reverse');
    const openClose = pair('Valve.Open', 'Valve.Close');
    const html = render({ state: { presentation: covered([forwardReverse, openClose], [openClose]) } });
    expect(html).toContain('Motor.Forward');
    expect(html).toContain('Motor.Reverse');
    expect(html).toContain('Covered');
    expect(html).toContain('Valve.Close');
    expect(html).toContain('Missing exact NEVER coverage');
  });
});
