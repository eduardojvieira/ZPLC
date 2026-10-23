import { afterEach, describe, expect, it } from 'bun:test';

import { getBlockCategories } from '../catalog/blockCatalog';
import { blockGroupLabel } from '../editors/fbd/palette';
import { useAppSettings } from '../store/useAppSettings';
import { presentOperationalStatus, type OperationalStatusInput } from './operationalStatusPresentation';

const base = {
  mode: 'simulate',
  adapterType: null,
  connected: false,
  vmInfo: null,
  status: { text: 'Desconectado', tone: 'neutral' as const },
  projectTargetBoard: 'rpi_pico',
  projectTasks: [],
  controllerInfo: null,
  controllerStatus: null,
  forcedValuesCount: 0,
  forcesUnconfirmed: false,
  nativeTrace: [],
} satisfies OperationalStatusInput;

const setLanguage = (language: 'en' | 'es') => useAppSettings.getState().update({ language });
afterEach(() => setLanguage('en'));

describe('UX-030 the status bar and the block groups in Spanish', () => {
  it('says the runtime, the target and the forces in Spanish, and in English again after the switch', () => {
    setLanguage('es');
    expect(presentOperationalStatus(base).runtime).toBe('Sin sesión de runtime');
    expect(presentOperationalStatus({ ...base, adapterType: 'native', connected: true, vmInfo: { cycles: 1 } })).toMatchObject({
      runtime: 'POSIX nativo',
      target: 'POSIX local',
    });
    expect(presentOperationalStatus({ ...base, adapterType: 'serial', connected: true }).status.text).toBe(
      'El modo del runtime no coincide · vuelva a conectar',
    );
    expect(presentOperationalStatus({ ...base, adapterType: 'native', connected: true, forcedValuesCount: 2 }).force?.text).toBe(
      '2 forzados activos',
    );
    setLanguage('en');
    expect(presentOperationalStatus(base).runtime).toBe('No runtime session');
  });

  it('names every block group of the catalogue in Spanish, and keeps an unknown group as it is', () => {
    setLanguage('es');
    expect(blockGroupLabel('Timers')).toBe('Temporizadores');
    expect(blockGroupLabel('Project')).toBe('Proyecto');
    expect(blockGroupLabel('Made by the author')).toBe('Made by the author');
    for (const { name } of getBlockCategories()) expect(blockGroupLabel(name)).not.toBe(name);
  });
});
