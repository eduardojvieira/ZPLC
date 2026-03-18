// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ZPLC',
  tagline: 'One Execution Core, Any Runtime.',
  favicon: 'img/favicon.ico',

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
              label: 'v1.5 Foundation',
            },
            '1.4.8': {
              label: 'v1.4.8',
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
        { name: 'description', content: 'ZPLC - The deterministic, portable, and secure IEC 61131-3 compatible runtime for modern industrial automation. The 2026 Standard.' },
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
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Documentation',
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
            title: 'Documentation',
            items: [
              {
                label: 'Platform Overview',
                to: '/docs/platform-overview',
              },
              {
                label: 'Runtime & Embedded',
                to: '/docs/runtime',
              },
              {
                label: 'Languages & IDE',
                to: '/docs/languages',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              {
                label: 'Integration & Deployment',
                to: '/docs/integration',
              },
              {
                label: 'Architecture',
                to: '/docs/architecture',
              },
              {
                label: 'Reference',
                to: '/docs/reference',
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
        copyright: `Copyright © 2026 ZPLC Project. Built for Resilience. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
