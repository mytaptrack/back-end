// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const {themes} = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'MyTapTrack Documentation',
  tagline: 'Comprehensive system documentation following TOGAF architecture perspectives',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://docs.mytaptrack.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // GitHub pages deployment config
  organizationName: 'mytaptrack',
  projectName: 'mytaptrack-docs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/mytaptrack/mytaptrack/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/mytaptrack-social-card.jpg',
      navbar: {
        title: 'MyTapTrack Docs',
        logo: {
          alt: 'MyTapTrack Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'architectureSidebar',
            position: 'left',
            label: 'Architecture',
          },
          {
            type: 'docSidebar',
            sidebarId: 'operationsSidebar',
            position: 'left',
            label: 'Operations',
          },
          {
            type: 'docSidebar',
            sidebarId: 'apiSidebar',
            position: 'left',
            label: 'API',
          },
          {
            type: 'docSidebar',
            sidebarId: 'developmentSidebar',
            position: 'left',
            label: 'Development',
          },
          {
            href: 'https://github.com/mytaptrack/mytaptrack',
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
                label: 'Architecture',
                to: '/Architecture',
              },
              {
                label: 'API Reference',
                to: '/API',
              },
              {
                label: 'Operations',
                to: '/Operations',
              },
            ],
          },
          {
            title: 'Support',
            items: [
              {
                label: 'User Guides',
                to: '/User',
              },
              {
                label: 'Troubleshooting',
                to: '/User/Troubleshooting',
              },
              {
                label: 'Contact Support',
                href: 'mailto:support@mytaptrack.com',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/mytaptrack/mytaptrack',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} MyTapTrack. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'json', 'yaml', 'typescript', 'javascript'],
      },
      algolia: {
        // The application ID provided by Algolia
        appId: 'YOUR_APP_ID',
        // Public API key: it is safe to commit it
        apiKey: 'YOUR_SEARCH_API_KEY',
        indexName: 'mytaptrack-docs',
        // Optional: see doc section below
        contextualSearch: true,
        // Optional: Specify domains where the navigation should occur through window.location instead on history.push
        externalUrlRegex: 'external\\.com|domain\\.com',
        // Optional: Replace parts of the item URLs from Algolia
        replaceSearchResultPathname: {
          from: '/docs/', // or as RegExp: /\/docs\//
          to: '/',
        },
        // Optional: path for search page that enabled by default (`false` to disable it)
        searchPagePath: 'search',
      },
    }),

  plugins: [
    // Custom plugin for draw.io XML processing
    function drawioPlugin() {
      return {
        name: 'drawio-plugin',
        configureWebpack() {
          return {
            module: {
              rules: [
                {
                  test: /\.drawio$/,
                  use: [
                    {
                      loader: 'file-loader',
                      options: {
                        name: 'diagrams/[name].[ext]',
                      },
                    },
                  ],
                },
              ],
            },
          };
        },
      };
    },
  ],
};

module.exports = config;