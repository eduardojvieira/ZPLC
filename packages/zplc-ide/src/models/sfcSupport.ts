import { t } from '../i18n'; /**
 * What the SFC palette offers (LNG-007): the elements the transpiler translates. The editor reads this table for its
 * palette, and the test that runs each element reads it too.
 */

export interface SFCPaletteElement {
  /** What the canvas is told on a drop. */
  type: 'step' | 'initial_step' | 'transition';
  label: string;
  description: string;
  category: 'Steps' | 'Transitions';
}

export const SFC_PALETTE: readonly SFCPaletteElement[] = [
  {
    type: 'step',
    get label() {
      return t('sfc.palette.step.label');
    },
    get description() {
      return t('sfc.palette.step.description');
    },
    category: 'Steps',
  },
  {
    type: 'initial_step',
    get label() {
      return t('sfc.palette.initial_step.label');
    },
    get description() {
      return t('sfc.palette.initial_step.description');
    },
    category: 'Steps',
  },
  {
    type: 'transition',
    get label() {
      return t('sfc.palette.transition.label');
    },
    get description() {
      return t('sfc.palette.transition.description');
    },
    category: 'Transitions',
  },
];
