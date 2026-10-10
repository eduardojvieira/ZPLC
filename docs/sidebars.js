/**
 * ZPLC Documentation Sidebar Configuration
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  // Main documentation sidebar
  docsSidebar: [
    {
      type: 'category',
      label: 'Quickstart / Inicio',
      className: 'sidebar-category-home',
      collapsed: false,
      items: [
        'getting-started/index',
        'platform-overview/index',
        'integration/index',
      ],
    },
    {
      type: 'category',
      label: 'Architecture / Arquitectura',
      className: 'sidebar-category-getting-started',
      collapsed: true,
      items: [
        'architecture/index',
        'runtime/index',
        'runtime/hal-contract',
        'runtime/memory-model',
        'runtime/scheduler',
        'runtime/connectivity',
        'runtime/communication-function-blocks',
        'runtime/isa',
        'runtime/persistence',
        'runtime/native-c',
      ],
    },
    {
      type: 'category',
      label: 'IDE & Languages / IDE y lenguajes',
      className: 'sidebar-category-runtime',
      collapsed: true,
      items: [
        'languages/index',
        'languages/st',
        'languages/il',
        'languages/stdlib',
        'runtime/stdlib',
        'languages/examples/v1-5-language-suite',
        'ide/index',
        'ide/overview',
        'ide/features',
        'ide/editors',
        'ide/compiler',
        'ide/deployment',
        'ide/migration-v1-to-v2',
        'ide/ai-privacy',
      ],
    },
    {
      type: 'category',
      label: 'Reference & Release / Referencia y release',
      className: 'sidebar-category-reference',
      collapsed: true,
      items: [
        'reference/index',
        'reference/runtime-api',
        'reference/boards',
        'reference/capabilities-evidence',
        'reference/zephyr-workspace-setup',
        'release-notes/index',
        'operations/index',
        'operations/shell',
        'operations/recovery',
      ],
    },
    {
      type: 'category',
      label: 'Contributing / Contribuir',
      className: 'sidebar-category-contributing',
      collapsed: true,
      items: [
        'contributing/index',
        'contributing/principles',
        'contributing/roadmap',
        'development/firmware-testing',
        'reference/source-of-truth',
        'reference/v1-5-canonical-docs-manifest',
      ],
    },
  ],
};

export default sidebars;
