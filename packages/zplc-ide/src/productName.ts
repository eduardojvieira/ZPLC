/**
 * The name of the application (decision D-03), written once for the renderer: the catalogs, the welcome title, the update
 * notices and the messages that name the product interpolate it. The main process keeps its own copy in
 * electron/productName.ts (tsc compiles that folder alone), and electron/productName.test.ts proves the two agree and that
 * index.html shows the same title. Renaming the product is one line here, one line there and the title in index.html.
 */
export const PRODUCT_NAME = 'ZPLC';

/** The title of the window (UX-016): the product alone with no project, `<project> — ZPLC` with one open. */
export const windowTitle = (projectName: string | null): string => (projectName ? `${projectName} — ${PRODUCT_NAME}` : PRODUCT_NAME);
