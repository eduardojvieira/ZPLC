/**
 * ZPLC Documentation Sidebar Configuration
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  // Main documentation sidebar
  docsSidebar: [
    {
      type: 'category',
      label: 'Home & Evaluation',
      className: 'sidebar-category-home',
      collapsed: false,
      items: [
        'getting-started/index',
        'platform-overview/index',
        'architecture/index',
      ],
    },
    {
      type: 'category',
      label: 'Getting Started',
      className: 'sidebar-category-getting-started',
      collapsed: true,
      items: [
        'integration/index', // Deployment and usage guidance
      ],
    },
    {
      type: 'category',
      label: 'Runtime & Embedded',
      className: 'sidebar-category-runtime',
      collapsed: true,
      items: [
        'runtime/index',
        'runtime/hal-contract',
        'runtime/memory-model',
        'runtime/scheduler',
        'runtime/connectivity',
        'runtime/communication-function-blocks',
      ],
    },
    {
      type: 'category',
      label: 'Languages & IDE',
      className: 'sidebar-category-languages',
      collapsed: true,
      items: [
        'languages/index',
        'languages/st',
        'languages/examples/v1-5-language-suite',
        'ide/index',
        'ide/overview',
        'ide/compiler',
        'ide/deployment',
      ],
    },
    {
      type: 'category',
      label: 'Operations & Reference',
      className: 'sidebar-category-reference',
      collapsed: true,
      items: [
        'operations/index',
        'reference/index',
        'contributing/index',
        'release-notes/index',
      ],
    },
  ],
};

export default sidebars;
