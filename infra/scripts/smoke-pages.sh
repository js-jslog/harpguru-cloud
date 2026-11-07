#!/usr/bin/env bash
# Checks the widget's paths on harpguru.com, /t/, /s/, /e/ and /w/, from the
# outside. Run it after `cdk deploy HarpguruSite`, signed in to the workload
# account:
#
#   AWS_PROFILE=harpguru scripts/smoke-pages.sh
#   AWS_PROFILE=harpguru scripts/smoke-pages.sh --pause
#
# Until harpguru's workflow has deployed the widget, the pages bucket is
# empty, so the script uploads placeholder pages, checks against them, then
# deletes them and invalidates their paths. It never touches a page that was
# already there: if a real one exists, it is checked as it stands.
#
# Framing can only be tested in a browser, which obeys frame-ancestors. With
# --pause, the script stops after its checks, with the placeholders still up,
# and prints a page to open; Enter then cleans up as usual.
set -uo pipefail

PAUSE=0
case "${1:-}" in
  '') ;;
  --pause) PAUSE=1 ;;
  *) echo "usage: $0 [--pause]"; exit 2 ;;
esac

HOST=harpguru.com
FAILED=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }

output() {
  aws cloudformation describe-stacks --stack-name HarpguruSite \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(output PagesBucketName)
DISTRIBUTION=$(output DistributionId)
if [[ -z "$BUCKET" || "$BUCKET" == None ]]; then
  echo "No PagesBucketName output: is HarpguruSite deployed, and AWS_PROFILE=harpguru set?"
  exit 1
fi

# The placeholders, by key. Each says which page it is, so a check can tell
# that a path reached the right object.
declare -A PLACEHOLDERS=(
  [t/smoke-test/index.html]='placeholder: t'
  [s/index.html]='placeholder: s'
  [e/index.html]='placeholder: e'
  [w/smoke-test.txt]='placeholder: w'
)
UPLOADED=()
cleanup() {
  [[ ${#UPLOADED[@]} == 0 ]] && return
  echo "Removing the placeholders"
  for key in "${UPLOADED[@]}"; do aws s3 rm --quiet "s3://$BUCKET/$key"; done
  aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" \
    --paths '/t/smoke-test*' '/s/*' '/e/*' '/w/smoke-test.txt' \
    --query 'Invalidation.Id' --output text >/dev/null &&
    echo "  invalidated their paths"
}
trap cleanup EXIT

echo "Placeholders, in s3://$BUCKET"
for key in "${!PLACEHOLDERS[@]}"; do
  if aws s3api head-object --bucket "$BUCKET" --key "$key" >/dev/null 2>&1; then
    echo "  $key exists already; checking it as it stands"
    continue
  fi
  type=text/html
  [[ "$key" == *.txt ]] && type=text/plain
  printf '<!doctype html><title>%s</title>%s\n' "${PLACEHOLDERS[$key]}" "${PLACEHOLDERS[$key]}" |
    aws s3 cp --quiet --content-type "$type" - "s3://$BUCKET/$key" &&
    UPLOADED+=("$key") && echo "  uploaded $key"
done
placed() { [[ " ${UPLOADED[*]} " == *" $1 "* ]]; }

# One request, never following redirects: "status|location".
probe() {
  curl -sS -o /dev/null --max-time 15 -w '%{http_code}|%{redirect_url}' "$1"
}
body_has() { curl -sS --max-time 15 "$1" | grep -qF "$2"; }

echo "Paths reach their pages"
for case in \
  "/t/smoke-test|t/smoke-test/index.html" \
  "/t/smoke-test/?k=C|t/smoke-test/index.html" \
  "/s/?t=country&k=C|s/index.html" \
  "/s/anything/at/all|s/index.html" \
  "/e/?t=country|e/index.html" \
  "/w/smoke-test.txt|w/smoke-test.txt"; do
  path=${case%%|*} key=${case#*|}
  IFS='|' read -r status _ <<<"$(probe "https://$HOST$path")"
  if [[ "$status" != 200 ]]; then
    fail "$path: status $status"
  elif placed "$key" && ! body_has "https://$HOST$path" "${PLACEHOLDERS[$key]}"; then
    fail "$path: 200, but not $key"
  else
    pass "$path: 200"
  fi
done
IFS='|' read -r status _ <<<"$(probe "https://$HOST/t/no-such-tuning")"
[[ "$status" == 404 ]] && pass "a missing tuning: 404" || fail "a missing tuning: status $status"

echo "The cache ignores the query string"
curl -sS -o /dev/null --max-time 15 "https://$HOST/t/smoke-test?k=C"
cache=$(curl -sS -I --max-time 15 "https://$HOST/t/smoke-test?k=D" | grep -i '^x-cache:' | tr -d '\r')
[[ "$cache" == *Hit* ]] && pass "?k=D after ?k=C: $cache" || fail "?k=D after ?k=C: '$cache'"

echo "Redirects"
for case in \
  "https://www.$HOST/t/smoke-test?k=C|https://$HOST/t/smoke-test?k=C" \
  "https://www.$HOST/e/?t=x|https://$HOST/e/?t=x" \
  "https://$HOST/s?k=C|https://$HOST/s/?k=C"; do
  from=${case%%|*} to=${case#*|}
  IFS='|' read -r status location <<<"$(probe "$from")"
  [[ "$status" == 301 && "$location" == "$to" ]] && pass "$from: 301 to $to" ||
    fail "$from: status $status, to '$location'"
done

echo "Framing headers"
headers() { curl -sS -I --max-time 15 "https://$HOST$1" | tr -d '\r'; }
for path in /t/smoke-test /s/; do
  h=$(headers "$path")
  grep -qi '^x-frame-options: DENY' <<<"$h" && grep -qi "^content-security-policy:.*frame-ancestors 'none'" <<<"$h" &&
    pass "$path: framing refused" || fail "$path: framing headers missing"
done
h=$(headers /e/)
! grep -qi '^x-frame-options:' <<<"$h" && grep -qi "^content-security-policy:.*frame-ancestors 'self'" <<<"$h" &&
  pass "/e/: no X-Frame-Options; frame-ancestors from 'self'" || fail "/e/: wrong framing headers"
grep -qi '^strict-transport-security:' <<<"$h" && pass "/e/: HSTS" || fail "/e/: no HSTS"

echo
if [[ $FAILED == 0 ]]; then echo "All checks passed."; else echo "Some checks failed."; fi

if [[ $PAUSE == 1 ]]; then
  cat <<'PAGE'

Paused, with the placeholders up. Save this as an .html file on the machine your
browser runs on, and open it from there:

  <!doctype html>
  <p>harpguru.com/e/ framed from a page that isn't on the allowlist:</p>
  <iframe src="https://harpguru.com/e/" width="400" height="200"></iframe>

Expect an empty or error frame, and in the developer console (F12) a message
that the frame was refused because of frame-ancestors 'self'. Opening
https://harpguru.com/e/ directly, in a tab, shows the placeholder.

PAGE
  read -r -p "Press Enter to remove the placeholders. " _
fi
exit $FAILED
