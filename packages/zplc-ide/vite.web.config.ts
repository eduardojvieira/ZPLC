/**
 * The web build (REL-037): the renderer as a static site for a sub-path of the docs site, with no Electron preload.
 * `bun run build:web` writes it to build/web; deploy-docs.yml copies that folder to the docs site as /app/.
 */
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';
import { webContentSecurityPolicy } from './src/platform/webCsp';

export default mergeConfig(
  base,
  defineConfig({
    define: { __ZPLC_WEB_BUILD__: 'true' },
    plugins: [
      {
        name: 'zplc-web-csp',
        transformIndexHtml: (html: string) =>
          html.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${webContentSecurityPolicy()}" />`,
          ),
      },
    ],
    // no source maps: they are 20 MB that nobody reads on a static site
    build: { outDir: 'build/web', emptyOutDir: true, sourcemap: false },
  }),
);
