/**
 * Lets a journey make one region throw while rendering, so that IDE-011 is proven on the real application: an exception
 * inside a region shows its error and Retry in that region only. Present in development hosts only: a production build
 * replaces `import.meta.env.DEV` with `false`, which leaves the probe unreferenced, and the bundle drops it.
 *
 * `window.dispatchEvent(new CustomEvent('zplc:inject-render-fault', { detail: 'Editor' }))` fails the region named
 * `Editor`. A boundary that re-mounts its children (Retry) mounts a fresh probe, which does not fail.
 */
import { useEffect, useState } from 'react';

const RENDER_FAULT_EVENT = 'zplc:inject-render-fault';

function Probe({ region }: { region: string }) {
  const [failing, setFailing] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail === region) setFailing(true); };
    window.addEventListener(RENDER_FAULT_EVENT, listener);
    return () => window.removeEventListener(RENDER_FAULT_EVENT, listener);
  }, [region]);
  if (failing) throw new Error(`Injected render fault in the ${region} region`);
  return null;
}

export function DevFaultProbe({ region }: { region: string }) {
  return import.meta.env.DEV ? <Probe region={region} /> : null;
}
