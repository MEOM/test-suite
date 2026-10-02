# Launch check: instructions for agents

You configure the launch check for this project and report its results. The
developer runs the checks; you make sure they test the right things.

## Your task and its limits

- Write `tests.config.mjs` in the project's `test-suite/` folder. If the folder
  does not exist, ask the developer to add the suite first (README, "Add the
  suite to a project").
- Never edit the suite in `node_modules/@meom/test-suite`, and never edit
  `README.md` or `AGENTS.md` in `test-suite/`: they are copies that
  `npm install` overwrites. The suite is a shared template; a change would make
  this project's checks differ from every other project's.
- When the config cannot express what the site needs (a feature the suite has
  no key for, markup the selectors cannot describe), stop and tell the
  developer that the template needs a new config key. Do not work around it.
- Ask the developer for anything you cannot read from the project or the site.
  Never guess URLs or credentials.

## Background and decisions

These are settled. Do not reopen them while configuring.

**Scope.** Pre-launch functional checks (page load, overflow, navigation, skip
link, sticky header, accordion, form), screenshots for a human visual review,
and an image-size audit. Out of scope: cookie consent, third-party widgets,
real devices, cross-browser pixel diffs, real form submissions.

**Matrix.** Six Playwright projects: Chromium phone (Pixel 5), tablet (iPad gen
7) and desktop (1440 x 900), Firefox desktop, WebKit phone (iPhone 13) and
desktop. WebKit is Safari's engine, not iOS Safari itself; that is enough for a
pre-launch pass.

**Tooling.** `@playwright/test`, because it drives Chromium, Firefox and WebKit.
BackstopJS (Chromium only) and Cypress (no stable WebKit) were rejected.

**No cross-browser pixel diff.** Browsers legitimately render fonts, form
widgets and scrollbars differently, so a pixel diff between them always fails.
A person reviews the gallery instead.

**Honesty rules.**
1. A failure is triaged as a failure. Never weaken a check or add an exception
   to make a run pass.
2. Every exception carries a `reason` the developer can agree with.
3. The visual review is done by a person.

## Configuration, key by key

Work against the local site unless the developer says otherwise. Useful tools:
`curl -sk` against the site and its REST API, `npx test-suite codegen <url>`
(from `test-suite/`) to inspect elements, and the browser automation tools you have.
Local WP-CLI: `docker compose exec -T --user vagrant wordpress wp ...` from the
project root.

### `name`

The site's name as the team calls it. Read `config.yml` (`name:`) or the site
title (`wp option get blogname`).

### `environments`

- `local: {}` is enough when `config.yml` has `development.domains`; the URL
  becomes `https://<first domain>`. Otherwise set `baseURL`.
- Add `staging` and `production` only with URLs the developer gives you. Ask
  whether the site is closed before launch: `wp-force-login` means
  `auth: 'wp-login'`, a browser password prompt means `auth: 'basic'`.
- With `auth`, the developer puts `TEST_AUTH_USER` and `TEST_AUTH_PASSWORD` in
  `.env.tests` in `test-suite/`. The account should be a Subscriber. Never
  write credentials into `tests.config.mjs`.

### `pages`

Pick pages by this fixed rule so every project is covered the same way:

1. the front page (`/`)
2. one basic page
3. each archive: the posts page and every public post type with an archive
4. one single of each public post type (posts and every custom post type)
5. the contact page
6. any page a feature uses (accordion, form) not already listed

Find them. List the public post types and their archives with WP-CLI, which
also sees post types that are not in the REST API:

```bash
wp post-type list --public=1 --fields=name,has_archive,rewrite --format=table
wp post list --post_type=page --post_status=publish --fields=ID,post_name --format=table
wp post list --post_type=<type> --post_status=publish --posts_per_page=1 --fields=ID,post_name --format=table
wp option get page_for_posts
```

Without WP-CLI access (a remote environment), use the REST API. It lists only
post types with REST support, so confirm the result against the theme's
`register_post_type` calls:

```bash
curl -sk '<baseURL>/wp-json/wp/v2/pages?per_page=100&_fields=slug,link'
curl -sk '<baseURL>/wp-json/wp/v2/types' | python3 -c "import sys,json;[print(k, v.get('rest_base')) for k,v in json.load(sys.stdin).items()]"
```

A public post type with an archive but no published posts has no single to
test: list its archive, leave the single out and tell the developer.

Use each page's final path with its trailing slash. `check-config` fails on a
path that redirects and names the final path. Slugs are short, unique and
lowercase; do not use `404` (the suite adds the 404 page itself). Labels
describe the template ("Single book"), not the content.

### `features`

Every key must be present. Set `false` when the site does not have the feature;
the report then says "not on this site".

- **`navigation`**: `{ desktopLink: '<text>' }`. Open the front page on desktop
  and pick a top-level menu item without a sub-menu. Its visible text is
  `desktopLink` (exact match). Items with a sub-menu are dropdown triggers and
  do not navigate. `false` only if the site has no main menu.
- **`skipLink`**: `true` when the page has `<a href="#content">` (kala-stack's
  header.php does).
  ```bash
  curl -sk <baseURL>/ | grep -o 'href="#[^"]*"' | head -3
  ```
- **`stickyHeader`**: `true` when the header uses Headroom (the element with
  `js-site-header` gets `headroom` classes in the browser). The front page must
  scroll at least 1200px; `check-config` tells you if it does not.
- **`accordion`**: `{ path: '<page>' }` for a page with a meomblocks accordion
  (`.accordion__header` buttons).
  ```bash
  wp post list --post_type=page --s='wp:meomblocks/accordion' --fields=ID,post_name
  ```
- **`form`**: `{ path: '<page>', gravityFormId: <id> }`. Find the page with the
  main contact form and read its id from the `id="gform_<id>"` element.
  Multi-page forms are not supported; pick a single-page form or set `false`
  and tell the developer.

### `exceptions`

Leave empty at first. Add an entry only after a run, for a failure you have
triaged as not a site problem, and only with the developer's agreement. Scope
local data gaps to local with `env: ['local']`, so they do not hide problems on
staging or production.

- `notFound`: a resource that legitimately 404s (for example a large media file
  not synced to local).
- `consoleErrors`: a console error from code the project cannot change.
- `blockHosts`: a third-party host that makes runs nondeterministic (for
  example a consent banner that loads asynchronously).

Each entry: `{ pattern: /regex/, reason: 'why this is justified', env?: [...] }`.

### `selectors` and `blockAnalytics`

Leave both out unless the site differs from kala-stack. The defaults are
`.js-site-nav`, `.js-site-nav-toggle`, `is-opened`, `.js-site-header`,
`#content` and `.accordion__header`. Override only the selector that differs.
`blockAnalytics` stays `true` unless the developer asks otherwise.

A complete example:
`node_modules/@meom/test-suite/examples/example-site.tests.config.mjs`.

## Verification

1. From `test-suite/`: `npm run check-config`. It must pass. Every failure names the
   config key to fix.
2. Run `npm run launch-check` (or ask the developer to).
3. Sort every failure in the report into one of two kinds:
   - **config error:** the check targets the wrong thing. Fix the config and
     rerun `check-config`.
   - **site error:** the site is broken. Report it to the developer. Do not
     change the config to hide it.

## Reporting to the developer

Summarize from `test-suite/report/<env>/launch-report.md`:

- the verdict and the environment it was run against
- every failure, grouped by check, with the affected devices and the message
- flaky tests, and whether their first failure was a timeout
- an INCOMPLETE verdict as incomplete, never as passed: which browsers did not
  start and the reason from the report, and what completes the run: the
  developer runs `npm run launch-check` in their own terminal app (or
  `npm run install-browsers` first when the browser executable is missing).
  Do not disable a sandbox yourself and do not retry a browser that cannot
  start. Before blaming your own environment, note whether the same reason
  appears when the developer runs it.
- features not tested, and exceptions in effect with their reasons
- the image audit totals and the largest items
- a reminder that the visual review checklist is theirs to do

Do not omit, soften or reinterpret a failure. If you are unsure whether a
failure is a site problem, say so and show the message.
