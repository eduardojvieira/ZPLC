/**
 * The renderer's side of the update check (IDE-010): one typed call over the `updateCheck` bridge of the preload, with
 * the answer validated again here. A missing bridge (a browser build) or a failing call is "could not tell".
 */
import { parseUpdateCheckResult, type UpdateCheckBridge, type UpdateCheckResult } from '../../electron/updateCheckProtocol';

export async function runUpdateCheck(bridge: UpdateCheckBridge | undefined, current: string): Promise<UpdateCheckResult> {
  try {
    return (bridge && parseUpdateCheckResult(await bridge.run())) || { status: 'unavailable', current };
  } catch {
    return { status: 'unavailable', current };
  }
}

/** One line for the Output panel and the preferences; the link is a release of this project (validated). */
export function describeUpdateCheck(result: UpdateCheckResult): string {
  if (result.status === 'available') return `A newer release of ZPLC Studio is available: ${result.latest} (this is ${result.current}). ${result.url}`;
  if (result.status === 'current') return `ZPLC Studio ${result.current} is up to date (latest release: ${result.latest}).`;
  return 'Could not check for updates. Check your network connection and try again.';
}
