/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // Main documentation sidebar
  mainSidebar: [
    'README',
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'Architecture/README',
        {
          type: 'category',
          label: 'Business Architecture',
          items: [
            'Architecture/Business/README',
          ],
        },
        {
          type: 'category',
          label: 'Application Architecture',
          items: [
            'Architecture/Application/README',
          ],
        },
        {
          type: 'category',
          label: 'Data Architecture',
          items: [
            'Architecture/Data/README',
          ],
        },
        {
          type: 'category',
          label: 'Technology Architecture',
          items: [
            'Architecture/Technology/README',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'Operations/README',
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: [
        'Development/README',
      ],
    },
    {
      type: 'category',
      label: 'API Documentation',
      items: [
        'API/README',
      ],
    },
    {
      type: 'category',
      label: 'User Documentation',
      items: [
        'User/README',
      ],
    },
    {
      type: 'category',
      label: 'Governance',
      items: [
        'Governance/README',
      ],
    },
  ],

  // Architecture-focused sidebar
  architectureSidebar: [
    'Architecture/README',
    {
      type: 'category',
      label: 'Business Architecture',
      items: [
        'Architecture/Business/README',
      ],
    },
    {
      type: 'category',
      label: 'Application Architecture',
      items: [
        'Architecture/Application/README',
      ],
    },
    {
      type: 'category',
      label: 'Data Architecture',
      items: [
        'Architecture/Data/README',
      ],
    },
    {
      type: 'category',
      label: 'Technology Architecture',
      items: [
        'Architecture/Technology/README',
      ],
    },
  ],

  // Operations-focused sidebar
  operationsSidebar: [
    'Operations/README',
  ],

  // API-focused sidebar
  apiSidebar: [
    'API/README',
  ],

  // Development-focused sidebar
  developmentSidebar: [
    'Development/README',
  ],
};

module.exports = sidebars;