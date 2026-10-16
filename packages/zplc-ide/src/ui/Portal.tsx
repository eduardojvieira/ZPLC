import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renders into the document body, so an overlay is not clipped or stacked under the region that opened it. Inline without a document (a server render, a test). */
export function Portal({ children }: { children: ReactNode }) {
  return typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body);
}
