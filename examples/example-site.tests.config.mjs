// A complete launch check config for a fictional kala-stack site. Copy the shape, not the values: every value here comes from the site, as AGENTS.md describes.
// selectors and blockAnalytics are left out on purpose, so the defaults apply.
export default {
  name: 'Example site',

  environments: {
    local: {}, // The URL comes from config.yml in the project root.
    staging: { baseURL: 'https://staging.example.com', auth: 'basic' },
    production: { baseURL: 'https://www.example.com', auth: 'wp-login' },
  },

  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'about', path: '/about/', label: 'Basic page' },
    { slug: 'news', path: '/news/', label: 'Posts archive' },
    { slug: 'post', path: '/example-post/', label: 'Single post' },
    { slug: 'references', path: '/references/', label: 'References archive' },
    { slug: 'reference', path: '/references/example-reference/', label: 'Single reference' },
    { slug: 'contact', path: '/contact/', label: 'Contact page' },
  ],

  features: {
    navigation: { desktopLink: 'About' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact/' },
    form: { path: '/contact/', gravityFormId: 1 },
  },

  exceptions: {
    notFound: [
      {
        pattern: /hero-video\.mp4$/,
        env: ['local'],
        reason: 'The hero video is not synced to local; staging and production serve it.',
      },
    ],
    consoleErrors: [],
    blockHosts: [
      {
        pattern: /consent\.example-cmp\.com/,
        reason: 'The consent banner loads asynchronously and makes screenshots nondeterministic.',
      },
    ],
  },
};
