import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { translatorFor } from '../i18n';
import { presentConnection } from './connectionPresentation';
import { presentOperationalStatus } from './operationalStatusPresentation';
import { projectLoaderStub } from '../test/projectLoaderStub';

// The status bar reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { OperationalStatusView } = await import('./OperationalStatusBar');

const { t } = translatorFor('en');

const view = (debug?: string) => {
  const presentation = presentOperationalStatus({
    mode: 'simulate',
    adapterType: 'native',
    connected: true,
    vmInfo: null,
    status: { text: 'Running', tone: 'success' },
    projectTargetBoard: undefined,
    projectTasks: undefined,
    controllerInfo: null,
    controllerStatus: null,
    forcedValuesCount: 0,
    forcesUnconfirmed: false,
    nativeTrace: [],
  });
  const indicator = presentConnection({ mode: 'simulate', adapterType: 'native', connected: true, connecting: false, faulted: false }, t);
  return renderToStaticMarkup(<OperationalStatusView presentation={presentation} indicator={indicator} debug={debug} />);
};

/**
 * UX-034: the debug state of the code editor is in the status bar; the minimap default is checked in journey 46 and in
 * editorViewSettings.test.ts.
 */
describe('code editor debug state (UX-034)', () => {
  it('UX-034 shows the debug state in the status bar with a label of its own', () => {
    const markup = view('Paused at line 12');
    expect(markup).toContain('Paused at line 12');
    expect(markup).toContain('>Debug<');
  });

  it('UX-034 shows no debug entry while nothing is being debugged', () => {
    expect(view(undefined)).not.toContain('>Debug<');
  });
});
