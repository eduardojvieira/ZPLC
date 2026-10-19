/**
 * The renderer's side of the update check (IDE-010): one typed call over the `updateCheck` bridge of the preload, with
 * the answer validated again here. A missing bridge (a browser build) or a failing call is "could not tell".
 */
import { t as translateNow, type Translator } from '../i18n';
import { parseUpdateCheckResult, type UpdateCheckBridge, type UpdateCheckResult } from '../../electron/updateCheckProtocol';

export async function runUpdateCheck(bridge: UpdateCheckBridge | undefined, current: string): Promise<UpdateCheckResult> {
  try {
    return (bridge && parseUpdateCheckResult(await bridge.run())) || { status: 'unavailable', current };
  } catch {
    return { status: 'unavailable', current };
  }
}

/** One line for the Output panel and the preferences; the link is a release of this project (validated). */
export function describeUpdateCheck(result: UpdateCheckResult, t: Translator['t'] = translateNow): string {
  if (result.status === 'available') return t('updateCheck.available', { latest: result.latest, current: result.current, url: result.url });
  if (result.status === 'current') return t('updateCheck.current', { current: result.current, latest: result.latest });
  return t('updateCheck.unavailable');
}

/**
 * The check at start (REL-021), as App runs it from an effect: it asks nothing while the user has the check turned off,
 * reports the answer when it comes (a newer release shows the notice; "could not tell" shows nothing), and returns the
 * function that drops an answer that arrives after the setting changed or Studio closed.
 */
export function startUpdateCheck(enabled: boolean, bridge: UpdateCheckBridge | undefined, current: string, report: (result: UpdateCheckResult) => void): () => void {
  if (!enabled) return () => undefined;
  let live = true;
  void runUpdateCheck(bridge, current).then((result) => { if (live) report(result); });
  return () => { live = false; };
}
