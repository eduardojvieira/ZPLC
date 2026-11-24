/**
 * "Fit scene" (VIS-002). The shell binds the command in every state, so the palette and the View menu always run it (FND-002); the
 * 3D plant view on screen offers how it is fitted, and with none on screen the command says why it fitted nothing.
 */
import { t } from '../../i18n';
import { useIDEStore } from '../../store/useIDEStore';

let fitShownScene: (() => void) | null = null;

/** Offered by a 3D plant view while it is on screen; the returned function withdraws exactly this offer. */
export function offerSceneFit(fit: () => void): () => void {
  fitShownScene = fit;
  return () => {
    if (fitShownScene === fit) fitShownScene = null;
  };
}

export function fitPlantScene(): void {
  if (fitShownScene) return fitShownScene();
  useIDEStore.getState().addConsoleEntry({ type: 'warning', message: t('plant.panel.fitNoView'), source: 'system' });
}
