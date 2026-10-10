/**
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
  { type: 'step', label: 'Step', description: 'Regular step state', category: 'Steps' },
  { type: 'initial_step', label: 'Initial Step', description: 'Starting state (double border)', category: 'Steps' },
  { type: 'transition', label: 'Transition', description: 'Condition between steps', category: 'Transitions' },
];
