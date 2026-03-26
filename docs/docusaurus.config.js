// @ts-nocheck
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ZPLC',
  tagline: 'v1.5.0 · One execution core, any runtime, one truthful release.',
  favicon: 'img/favicon.png',

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
    // Built-in search is enabled by default in classic preset,
    // explicitly ensuring we don't disable it or swap it here.
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
              label: 'v1.5.0',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css', // Preserving visual identity contract
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/banner.png',
      metadata: [
        { name: 'keywords', content: 'plc, iec 61131-3, zephyr rtos, industrial automation, open source, stm32, esp32, raspberry pi pico, modbus, mqtt, scada, softplc, real-time' },
        { name: 'description', content: 'ZPLC v1.5.0 aligns runtime, IDE, supported boards, bilingual docs, and release evidence into one truthful industrial automation release.' },
      ],
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'ZPLC',
        logo: {
          alt: 'ZPLC Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'getting-started/index',
            position: 'left',
            label: 'Docs / Documentación',
          },
          {
            type: 'docsVersionDropdown',
            position: 'right',
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
        style: 'dark',
        links: [
          {
            title: 'Docs / Documentación',
            items: [
              {
                label: 'Quickstart / Inicio',
                to: '/docs/getting-started',
              },
              {
                label: 'Platform Overview / Visión general',
                to: '/docs/platform-overview',
              },
              {
                label: 'Runtime / Runtime',
                to: '/docs/runtime',
              },
              {
                label: 'IDE / IDE',
                to: '/docs/ide',
              },
            ],
          },
          {
            title: 'Release / Release',
            items: [
              {
                label: 'Canonical Manifest / Manifiesto',
                to: '/docs/reference/v1-5-canonical-docs-manifest',
              },
              {
                label: 'Source of Truth / Fuentes de verdad',
                to: '/docs/reference/source-of-truth',
              },
              {
                label: 'Release Notes / Notas de versión',
                to: '/docs/release-notes',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/eduardojvieira/ZPLC',
              },
              {
                label: 'Discussions',
                href: 'https://github.com/eduardojvieira/ZPLC/discussions',
              },
              {
                label: 'Zephyr Project',
                href: 'https://zephyrproject.org/',
              },
            ],
          },
        ],
        copyright: `Copyright © 2026 ZPLC Project. v1.5.0 docs aligned with runtime, IDE, and release evidence.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
