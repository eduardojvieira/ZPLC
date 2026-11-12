import { describe, expect, it } from 'bun:test';
import { translatorFor } from '../i18n';
import { getStatusDisplay, type StatusInput } from './programState';

const base: StatusInput = {
  isConnected: true,
  vmState: 'idle',
  executionMode: 'simulate',
  programLoaded: false,
  currentBuild: true,
  anyBuild: true,
};

describe('getStatusDisplay (moved out of the toolbar, its words unchanged)', () => {
  const rows: Array<[string, Partial<StatusInput>, string, string]> = [
    ['not connected', { isConnected: false }, 'Disconnected', 'neutral'],
    ['running', { vmState: 'running' }, 'Running', 'success'],
    ['running, stale build', { vmState: 'running', currentBuild: false }, 'Running · rebuild required', 'attention'],
    ['paused', { vmState: 'paused' }, 'Paused', 'attention'],
    ['paused, stale build', { vmState: 'paused', currentBuild: false }, 'Paused · rebuild required', 'attention'],
    ['simulation ready', {}, 'Ready', 'info'],
    ['simulation ready, stale build', { currentBuild: false }, 'Ready · rebuild required', 'attention'],
    ['simulation ready, never built', { currentBuild: false, anyBuild: false }, 'Ready', 'info'],
    ['board deployed', { executionMode: 'hardware', programLoaded: true }, 'Deployed · stopped', 'info'],
    ['board connected, build current', { executionMode: 'hardware' }, 'Connected · deploy required', 'info'],
    ['board connected, stale build', { executionMode: 'hardware', currentBuild: false }, 'Connected · rebuild required', 'attention'],
    ['board connected, never built', { executionMode: 'hardware', currentBuild: false, anyBuild: false }, 'Connected · build required', 'info'],
    ['error', { vmState: 'error' }, 'Error', 'danger'],
    ['an unknown state', { vmState: 'booting' as never }, 'booting', 'neutral'],
  ];
  for (const [name, over, text, tone] of rows) {
    it(`${name} reads "${text}"`, () => {
      expect(getStatusDisplay({ ...base, ...over }, translatorFor('en').t)).toEqual({ text, tone } as never);
    });
  }

  it('speaks Spanish with the same rows', () => {
    const es = translatorFor('es').t;
    expect(getStatusDisplay({ ...base, vmState: 'running', currentBuild: false }, es).text).toBe('En ejecución · compilación desactualizada');
    expect(getStatusDisplay({ ...base, executionMode: 'hardware', programLoaded: true }, es).text).toBe('Cargado · detenido');
  });
});
