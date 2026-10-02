#!/usr/bin/env bash
# Seeds the launch check test bed (test-suite.local). Run from this repo on a
# fresh kala-stack WordPress install:
#   bash testbed/seed.sh <path to the site>
# Refuses to run twice.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="${1:?usage: bash testbed/seed.sh <path to the kala-stack site>}"
cd "$site"
wp() { docker compose exec -T --user vagrant wordpress wp "$@"; }
content() { cat "$here/content/$1"; }

if [ -n "$(wp post list --post_type=page --name=contact --field=ID)" ]; then
  echo "Test bed already seeded (a page named 'contact' exists). Aborting." >&2
  exit 1
fi

# WordPress lives in /wordpress; the site itself is served from the root.
wp option update home https://test-suite.local
wp rewrite structure '/%postname%/' --hard

image_path=$(wp eval-file - < "$here/make-image.php")
image_id=$(wp media import "$image_path" --title="Test bed image" --porcelain)
image_url=$(wp eval "echo wp_get_attachment_image_url($image_id, 'large');")
form_id=$(wp eval-file - < "$here/gf-form.php")

home_id=$(wp post create --post_type=page --post_status=publish --post_title=Home --post_name=home --post_content="$(content home.html)" --porcelain)
about_id=$(wp post create --post_type=page --post_status=publish --post_title=About --post_name=about \
  --post_content="$(content about.html | sed "s|__IMAGE_ID__|$image_id|g; s|__IMAGE_URL__|$image_url|g")" --porcelain)
contact_id=$(wp post create --post_type=page --post_status=publish --post_title=Contact --post_name=contact \
  --post_content="$(content contact.html | sed "s|__FORM_ID__|$form_id|g")" --porcelain)
news_id=$(wp post create --post_type=page --post_status=publish --post_title=News --post_name=news --porcelain)

wp post create --post_type=post --post_status=publish --post_title="First news post" --post_name=first-news-post \
  --post_content='<!-- wp:paragraph --><p>The first news post.</p><!-- /wp:paragraph -->' --porcelain
wp post create --post_type=post --post_status=publish --post_title="Second news post" --post_name=second-news-post \
  --post_content='<!-- wp:paragraph --><p>The second news post.</p><!-- /wp:paragraph -->' --porcelain

wp option update show_on_front page
wp option update page_on_front "$home_id"
wp option update page_for_posts "$news_id"

menu_id=$(wp menu create "Main" --porcelain)
wp menu item add-post "$menu_id" "$about_id" --title=About
wp menu item add-post "$menu_id" "$news_id" --title=News
wp menu item add-post "$menu_id" "$contact_id" --title=Contact
wp menu location assign "$menu_id" main_menu

password=$(openssl rand -hex 12)
wp user create launchcheck launchcheck@example.com --role=subscriber --user_pass="$password" --porcelain
printf 'TEST_AUTH_USER=launchcheck\nTEST_AUTH_PASSWORD=%s\n' "$password" > "$here/.env.tests"

wp rewrite flush --hard
echo "Seeded. Gravity Form id: $form_id. Credentials written to $here/.env.tests."
