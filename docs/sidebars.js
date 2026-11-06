/**
 * ZPLC documentation sidebar (DOC-002).
 *
 * The pages are grouped by what the reader came to do, in the order of a reader's journey:
 *
 *   Start here          what ZPLC is, install it, run a first program without hardware, then on a board
 *   Learn               the course
 *   Program             write, run, test and debug a program: the languages and the application
 *   Connect and deploy  boards, firmware, deploying, operating and communications
 *   Concepts            understand how it works and what it does not claim
 *   Reference           look a fact up (generated from the source where a source exists)
 *   Project             contribute and follow the release
 *
 * Every page of the site is listed once. Changing a folder or a slug breaks a published address, so a page moves
 * between categories here and keeps its file. The labels are English; the Spanish ones are in
 * i18n/es/docusaurus-plugin-content-docs/current.json, which the structure test (tools/docs/docs_structure.test.ts)
 * checks label by label. The generated course and lesson pages are unlisted: the course pages link to them.
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Start here',
      collapsed: false,
      items: [
        'getting-started/index',
        'getting-started/install',
        'platform-overview/index',
        'tutorials/blink-without-hardware',
        'tutorials/first-board',
      ],
    },
    {
      type: 'category',
      label: 'Learn',
      collapsed: true,
      items: ['learn/index', 'learn/course-outline', 'learn/hardware-track', 'learn/educators', 'learn/glossary'],
    },
    {
      type: 'category',
      label: 'Program',
      collapsed: true,
      items: [
        {
          type: 'category',
          label: 'Languages',
          collapsed: true,
          items: ['languages/index', 'languages/st', 'languages/ld', 'languages/fbd', 'languages/sfc', 'languages/il'],
        },
        {
          type: 'category',
          label: 'ZPLC application',
          collapsed: true,
          items: ['ide/index', 'ide/features', 'ide/editors', 'ide/compiler', 'ide/migration-v1-to-v2'],
        },
        {
          type: 'category',
          label: 'Simulate, test and debug',
          collapsed: true,
          items: ['guides/simulate-and-debug', 'guides/scenario-tests', 'guides/force-values', 'guides/troubleshooting'],
        },
        {
          type: 'category',
          label: 'Work with projects',
          collapsed: true,
          items: [
            'guides/map-io',
            'guides/retained-variables',
            'guides/project-archive',
            'guides/command-line',
            'guides/ai-and-mcp',
            'ide/ai-privacy',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Connect and deploy',
      collapsed: true,
      items: [
        {
          type: 'category',
          label: 'Boards and firmware',
          collapsed: true,
          items: [
            'reference/zephyr-workspace-setup',
            'guides/build-firmware',
            'guides/flash-firmware',
            'guides/port-to-a-board',
            'runtime/native-c',
          ],
        },
        {
          type: 'category',
          label: 'Deploy and operate',
          collapsed: true,
          items: ['integration/index', 'ide/deployment', 'operations/index', 'operations/recovery', 'operations/shell'],
        },
        {
          type: 'category',
          label: 'Communications',
          collapsed: true,
          items: [
            'runtime/connectivity',
            'runtime/communication-function-blocks',
            'guides/modbus',
            'guides/mqtt-sparkplug',
            'guides/cloud-blocks',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: true,
      items: [
        'architecture/index',
        'runtime/index',
        'runtime/scheduler',
        'runtime/memory-model',
        'runtime/persistence',
        'runtime/hal-contract',
        'runtime/browser-runtime',
        'runtime/stdlib',
        'reference/capabilities-evidence',
        'safety-and-limitations',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/index',
        {
          type: 'category',
          label: 'Language reference',
          collapsed: true,
          items: [
            'reference/language-st',
            'reference/language-il',
            'reference/language-ld',
            'reference/language-fbd',
            'reference/language-sfc',
            'reference/visual-editor-keyboard',
          ],
        },
        {
          type: 'category',
          label: 'Functions and function blocks',
          collapsed: true,
          items: ['reference/functions', 'reference/function-blocks'],
        },
        {
          type: 'category',
          label: 'Projects and tools',
          collapsed: true,
          items: ['reference/project-file', 'reference/scenario-file', 'reference/cli', 'reference/mcp', 'reference/diagnostic-codes'],
        },
        {
          type: 'category',
          label: 'Runtime and firmware',
          collapsed: true,
          items: [
            'reference/runtime-api',
            'reference/runtime-protocol',
            'reference/device-protocol',
            'reference/kconfig',
            'reference/shell-commands',
            'runtime/isa',
            'runtime/port-interface',
          ],
        },
        {
          type: 'category',
          label: 'Boards',
          collapsed: true,
          items: [
            'reference/boards',
            'reference/learner-kits/index',
            'reference/learner-kits/rpi-pico-rp2040',
            'reference/learner-kits/esp32-s3-devkitc',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Project',
      collapsed: true,
      items: [
        'contributing/index',
        'contributing/principles',
        'contributing/roadmap',
        'development/code-style',
        'development/firmware-testing',
        'development/hardware-in-the-loop',
        'development/hil-emulation',
        'development/hardware-software-review',
        'development/screen-reader-check',
        'development/history-rewrite',
        'integration/publishing',
        'release-notes/index',
        'reference/source-of-truth',
      ],
    },
  ],
};

export default sidebars;
