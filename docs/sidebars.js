/**
 * ZPLC Documentation Sidebar Configuration
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  // Main documentation sidebar
  docsSidebar: [
    // Getting Started section
    {
      type: 'category',
      label: 'Getting Started',
      className: 'sidebar-category-getting-started',
      collapsed: false,
      items: [
        'getting-started/quickstart',
      ],
    },
    
    // IDE User Manual
    {
      type: 'category',
      label: 'IDE User Manual',
      className: 'sidebar-category-ide',
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
    
    // Hardware section
    {
      type: 'category',
      label: 'Hardware',
      className: 'sidebar-category-hardware',
      items: [
        'hardware/pinouts',
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
      ],
    },
    
    // Advanced Topics
    {
      type: 'category',
      label: 'Advanced Topics',
      className: 'sidebar-category-advanced',
      items: [
        'advanced/multitask',
        'advanced/debugging',
        'advanced/ai-agents',
      ],
    },
  ],
};

export default sidebars;
