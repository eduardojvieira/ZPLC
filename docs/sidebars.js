/**
 * ZPLC Documentation Sidebar Configuration
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  // Main documentation sidebar
  docsSidebar: [
    // IDE User Manual
    {
      type: 'category',
      label: 'IDE User Manual',
      className: 'sidebar-category-ide',
      collapsed: false,
      items: [
        'ide/overview',
        'ide/editors',
        'ide/compiler',
        'ide/deployment',
      ],
    },

    // IEC 61131-3 Reference
    {
      type: 'category',
      label: 'Language Reference',
      className: 'sidebar-category-languages',
      items: [
        'languages/st',
        'languages/il',
        'languages/stdlib',
      ],
    },
    
    // Runtime Reference
    {
      type: 'category',
      label: 'Runtime Reference',
      className: 'sidebar-category-runtime',
      items: [
        'runtime/intro',
        'runtime/isa',
        'runtime/scheduler',
        'runtime/persistence',
        'runtime/hal',
        'runtime/stdlib',
      ],
    },
    
    // Advanced Topics
    {
      type: 'category',
      label: 'Advanced Topics',
      className: 'sidebar-category-advanced',
      items: [
        'advanced/ai-agents',
      ],
    },
  ],
};

export default sidebars;
