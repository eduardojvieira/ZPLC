// @ts-nocheck
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { readFileSync } from 'node:fs';
import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// REL-033: the footer names the latest published release. The deploy workflow passes its tag in ZPLC_RELEASE_TAG; a build
// without it names the version of this tree.
const releaseTag =
  process.env.ZPLC_RELEASE_TAG || `v${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ZPLC',
  tagline: 'Open-source IEC 61131-3 PLC runtime and development environment on Zephyr RTOS.',
  favicon: 'img/favicon.png',
  // read by src/theme/Footer/Copyright, which names the release in the translated footer too
  customFields: { releaseTag },

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,
  },

  url: 'https://eduardojvieira.github.io',
  baseUrl: '/ZPLC/',
  trailingSlash: true,
  organizationName: 'eduardojvieira',
  projectName: 'ZPLC',

  onBrokenLinks: 'throw',
  // A link to a heading that no longer exists is as broken as a link to a page that does not (DOC-002).
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    localeConfigs: {
      en: {
        label: 'English',
      },
      es: {
        label: 'Español',
      },
    },
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    // DOC-018: full-text search that runs in the browser from an index built with the site, in both languages, with no
    // service and no account. `hashed` puts a content hash in the index URL so a cache never serves an old one.
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        language: ['en', 'es'],
        docsRouteBasePath: '/docs',
        indexBlog: false,
        explicitSearchResultPath: true,
      }),
    ],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/eduardojvieira/ZPLC/tree/master/docs/',
          lastVersion: 'current',
          versions: {
            current: {
              label: '2.0',
            },
          },
        },
        blog: false,
        theme: {
          // The theme of the site inherits the visual system of the ZPLC application (docs/design/design-brief.md).
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/social-card.png',
      metadata: [
        {
          name: 'keywords',
          content:
            'plc, iec 61131-3, structured text, ladder diagram, zephyr rtos, industrial automation, open source, stm32, esp32, raspberry ' +
            'pi pico, modbus, mqtt',
        },
        {
          name: 'description',
          content:
            'ZPLC is an open-source IEC 61131-3 PLC runtime in portable C99 and a desktop IDE. Write, test and simulate PLC programs on ' +
            'your computer, and build the runtime for Zephyr boards.',
        },
      ],
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'ZPLC',
        logo: {
          alt: 'ZPLC',
          src: 'img/logo.svg',
        },
        items: [
          // Plain links with their own patterns: a `doc` item counts as active on every page of its sidebar, and every page
          // shares one sidebar, so all three would be marked.
          {
            to: '/docs/getting-started',
            label: 'Docs',
            position: 'left',
            activeBaseRegex: '/docs/(?!learn|release-notes)',
          },
          {
            to: '/docs/learn',
            label: 'Learn',
            position: 'left',
            activeBaseRegex: '/docs/learn',
          },
          {
            to: '/docs/release-notes',
            label: 'Release notes',
            position: 'left',
            activeBaseRegex: '/docs/release-notes',
          },
          {
            type: 'localeDropdown',
            position: 'right',
          },
          {
            href: 'https://github.com/eduardojvieira/ZPLC',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Documentation',
            items: [
              { label: 'Getting started', to: '/docs/getting-started' },
              { label: 'Languages', to: '/docs/languages' },
              { label: 'ZPLC application', to: '/docs/ide' },
              { label: 'Runtime', to: '/docs/runtime' },
              { label: 'Boards', to: '/docs/reference/boards' },
              { label: 'Reference', to: '/docs/reference' },
            ],
          },
          {
            title: 'Project',
            items: [
              { label: 'Release notes', to: '/docs/release-notes' },
              { label: 'Safety and limitations', to: '/docs/safety-and-limitations' },
              { label: 'Contributing', to: '/docs/contributing' },
              { label: 'Roadmap', to: '/docs/contributing/roadmap' },
            ],
          },
          {
            title: 'Source',
            items: [
              { label: 'GitHub', href: 'https://github.com/eduardojvieira/ZPLC' },
              { label: 'Discussions', href: 'https://github.com/eduardojvieira/ZPLC/discussions' },
              { label: 'MIT licence', href: 'https://github.com/eduardojvieira/ZPLC/blob/master/LICENSE' },
            ],
          },
        ],
        copyright: `Copyright © 2026 ZPLC contributors. Released under the MIT licence. ZPLC ${releaseTag}.`,
      },
      prism: {
        theme: prismThemes.oneLight,
        darkTheme: prismThemes.oneDark,
      },
    }),
};

export default config;
