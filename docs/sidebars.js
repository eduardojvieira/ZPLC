/**
 * ZPLC documentation sidebar (DOC-002).
 *
 * The pages are grouped by what the reader came to do, not by who wrote them:
 *
 *   Start here    get running, and what ZPLC is and is not
 *   How-to guides do one task
 *   Reference     look a fact up (generated from the source where a source exists)
 *   Concepts      understand how it works
 *   Learn         practise
 *   Project       contribute and follow the release
 *
 * Every page of the site is listed once. Changing a folder or a slug breaks a published address, so a page moves
 * between categories here and keeps its file. The labels are English; the Spanish ones are in
 * i18n/es/docusaurus-plugin-content-docs/current.json, which the structure test (tools/docs/docs_structure.test.ts)
 * checks label by label.
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
        'tutorials/blink-without-hardware',
        'tutorials/first-board',
        'platform-overview/index',
        'reference/capabilities-evidence',
        'safety-and-limitations',
      ],
    },
    {
      type: 'category',
      label: 'How-to guides',
      collapsed: true,
      items: [
        'guides/map-io',
        'guides/modbus',
        'guides/mqtt-sparkplug',
        'guides/cloud-blocks',
        'guides/force-values',
        'guides/retained-variables',
        'guides/scenario-tests',
        'guides/project-archive',
        'guides/simulate-and-debug',
        'guides/command-line',
        'guides/ai-and-mcp',
        'guides/port-to-a-board',
        'guides/troubleshooting',
        'integration/index',
        'ide/deployment',
        'ide/migration-v1-to-v2',
        'ide/ai-privacy',
        'operations/index',
        'operations/recovery',
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
          label: 'Languages',
          collapsed: true,
          items: [
            'languages/st',
            'languages/structured-text',
            'languages/il',
            'reference/language-st',
            'reference/language-il',
            'reference/language-ld',
            'reference/language-fbd',
            'reference/language-sfc',
          ],
        },
        {
          type: 'category',
          label: 'Functions and function blocks',
          collapsed: true,
          items: [
            'reference/functions',
            'reference/function-blocks',
            'languages/stdlib',
            'runtime/stdlib',
          ],
        },
        {
          type: 'category',
          label: 'Projects and tools',
          collapsed: true,
          items: [
            'reference/project-file',
            'reference/scenario-file',
            'reference/cli',
            'reference/mcp',
          ],
        },
        {
          type: 'category',
          label: 'Runtime and firmware',
          collapsed: true,
          items: [
            'reference/runtime-api',
            'reference/runtime-protocol',
            'reference/kconfig',
            'reference/shell-commands',
            'operations/shell',
            'runtime/isa',
            'runtime/hal-contract',
          ],
        },
        {
          type: 'category',
          label: 'Boards',
          collapsed: true,
          items: [
            'reference/boards',
            'reference/zephyr-workspace-setup',
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
        {
          type: 'category',
          label: 'Studio',
          collapsed: true,
          items: [
            'ide/index',
            'ide/overview',
            'ide/features',
            'ide/editors',
            'ide/compiler',
          ],
        },
        'languages/index',
        {
          type: 'category',
          label: 'Runtime',
          collapsed: true,
          items: [
            'runtime/index',
            'runtime/intro',
            'runtime/scheduler',
            'runtime/memory-model',
            'runtime/persistence',
            'runtime/connectivity',
            'runtime/communication-function-blocks',
            'runtime/native-c',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Learn',
      collapsed: true,
      items: [
        'learn/index',
        'languages/examples/v1-5-language-suite',
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
        'development/firmware-testing',
        'development/hardware-in-the-loop',
        'release-notes/index',
        'reference/source-of-truth',
        'reference/v1-5-canonical-docs-manifest',
      ],
    },
  ],
};

export default sidebars;
