// The test bed (test-suite.local) config, written by following AGENTS.md.
// testbed/ is the suite folder for the dev loop (see testbed/README.md), so
// the local URL is set here instead of read from config.yml.
export default {
  name: 'Test Suite',

  environments: {
    local: { baseURL: 'https://test-suite.local' },
    // The local site behind wp-force-login. Activate the plugin before using
    // it; credentials come from testbed/.env.tests.
    login: { baseURL: 'https://test-suite.local', auth: 'wp-login' },
  },

  pages: [
    { slug: 'front', path: '/', label: 'Front page' },
    { slug: 'about', path: '/about/', label: 'About' },
    { slug: 'news', path: '/news/', label: 'News archive' },
    { slug: 'article', path: '/second-news-post/', label: 'Single post' },
    { slug: 'contact', path: '/contact/', label: 'Contact' },
  ],

  features: {
    navigation: { desktopLink: 'About' },
    skipLink: true,
    stickyHeader: true,
    accordion: { path: '/contact/' },
    form: { path: '/contact/', gravityFormId: 1 },
  },

  exceptions: {},
};
