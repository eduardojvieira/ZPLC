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
        'languages/examples/v1-5-language-suite',
        'ide/index',
        'ide/overview',
        'ide/editors',
        'ide/compiler',
        'ide/deployment',
      ],
    },
    {
      type: 'category',
      label: 'Reference & Release / Referencia y release',
      className: 'sidebar-category-reference',
      collapsed: true,
      items: [
        'reference/index',
        'reference/v1-5-canonical-docs-manifest',
        'reference/source-of-truth',
        'reference/runtime-api',
        'reference/boards',
        'reference/zephyr-workspace-setup',
        'release-notes/index',
        'operations/index',
        'operations/shell',
        'contributing/index',
      ],
    },
  ],
};

export default sidebars;
