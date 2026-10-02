# Test bed

`test-suite.local` is the kala-stack site the suite is verified against. It
has one page per template type and every feature the suite checks: a main
menu, the skip link, the Headroom header, a meomblocks accordion and a Gravity
Form. The About page shows a generated 2400x1600 image at 300px, so the image
audit always has an oversized image to report.

The site itself is not in this repo. Create a kala-stack site on
`test-suite.local`, then seed it from this repo:

    bash testbed/seed.sh <path to the site>

The script refuses to run twice. It creates the Subscriber `launchcheck` and
writes its credentials to `testbed/.env.tests` (gitignored).

## Dev loop

`testbed/` is a suite folder: it holds `tests.config.mjs` and receives
`report/` and `.auth/`. Run the CLI from the repo against it:

    cd testbed
    node ../bin/test-suite.js config
    node ../bin/test-suite.js run

The `login` environment checks `auth: 'wp-login'`. Activate `wp-force-login`
on the site first:

    TEST_ENV=login node ../bin/test-suite.js config

## Install check

Before a release, install the package in the site the way a project does:

    cd <site>
    node <this repo>/bin/test-suite.js init --source file:<this repo>
    cp <this repo>/testbed/tests.config.mjs <this repo>/testbed/.env.tests test-suite/
    cd test-suite && npm run launch-check

Then repeat with the `npm pack` tarball (`npm install <tarball>`) to prove the
`files` list is complete.
