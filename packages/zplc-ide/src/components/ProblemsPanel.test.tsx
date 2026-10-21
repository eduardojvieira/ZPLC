// IDE-020: the Problems tab labels the live diagnostics apart from the build's, lists errors first and offers a way to a location.
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProblemsPanel } from './ProblemsPanel';

const tree = {
  name: 'p',
  path: '',
  type: 'directory',
  children: [{ name: 'Motor.st', path: 'src/Motor.st', type: 'file', language: 'ST' }],
} as never;
const render = (patch: Partial<Parameters<typeof ProblemsPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <ProblemsPanel
      summary="1 error · 1 warning"
      live={[]}
      buildMessages={[]}
      checked={false}
      fileTree={tree}
      activeFilePath="src/Motor.st"
      onActivate={() => undefined}
      {...patch}
    />,
  );

describe('the Problems tab (IDE-020)', () => {
  it('labels the live diagnostics apart from the latest build and says what to do when nothing was checked', () => {
    const html = render({ live: [{ type: 'error', message: 'Unknown identifier', line: 3, column: 1 }] });
    expect(html).toContain('Live ST diagnostics · not build evidence');
    expect(html).toContain('aria-label="Latest build diagnostics"');
    expect(html).toContain('Compile the project to check it for problems.');
  });
  it('lists the errors of a build before its warnings, each with its position and a button to reach it', () => {
    const html = render({
      checked: true,
      buildMessages: [
        { type: 'warning', message: 'Unused variable', file: 'src/Motor.st', line: 9 },
        { type: 'error', message: 'Unknown identifier', file: 'src/Motor.st', line: 3, column: 2, code: 'UNKNOWN_IDENTIFIER' },
      ],
    });
    expect(html.indexOf('Unknown identifier')).toBeLessThan(html.indexOf('Unused variable'));
    expect(html).toContain('src/Motor.st:3:2');
    expect(html).toContain('data-diagnostic-code');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });
});
