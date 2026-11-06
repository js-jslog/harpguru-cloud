#!/usr/bin/env bash
# Checks harpguru.com from the outside, as a browser, Apple and Google see it.
# Read-only: it only makes HTTPS requests. Run it after `cdk deploy HarpguruSite`.
#
#   scripts/smoke-site.sh                # against harpguru.com
#   scripts/smoke-site.sh d123.cloudfront.net   # straight at the distribution
#
# The second form checks the .well-known files before the DNS records answer,
# but not the www redirect or the certificate, which need the real names.
set -uo pipefail

HOST="${1:-harpguru.com}"
FAILED=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }

# One request, never following redirects: prints "status|content-type|location".
probe() {
  curl -sS -o /dev/null --max-time 15 \
    -w '%{http_code}|%{content_type}|%{redirect_url}' "$1"
}

echo "The .well-known files, on https://$HOST"
for path in .well-known/apple-app-site-association .well-known/assetlinks.json; do
  url="https://$HOST/$path"
  IFS='|' read -r status type location <<<"$(probe "$url")"
  [[ "$status" == 200 ]] && pass "$path: 200" || fail "$path: status $status${location:+, redirects to $location}"
  [[ "$type" == application/json* ]] && pass "$path: $type" || fail "$path: content type '$type'"
  if curl -sS --max-time 15 "$url" | jq -e . >/dev/null 2>&1; then
    pass "$path: parses as JSON"
  else
    fail "$path: does not parse as JSON"
  fi
done

echo "The landing page"
IFS='|' read -r status type _ <<<"$(probe "https://$HOST/")"
[[ "$status" == 200 && "$type" == text/html* ]] && pass "/: 200, $type" || fail "/: status $status, '$type'"
IFS='|' read -r status _ _ <<<"$(probe "https://$HOST/no-such-page")"
[[ "$status" == 404 ]] && pass "a missing page: 404" || fail "a missing page: status $status"
headers=$(curl -sS -I --max-time 15 "https://$HOST/")
grep -qi '^strict-transport-security:' <<<"$headers" && pass "HSTS header present" || fail "no HSTS header"
grep -qi '^content-security-policy:' <<<"$headers" && pass "CSP header present" || fail "no CSP header"

if [[ "$HOST" == harpguru.com ]]; then
  echo "Redirects"
  IFS='|' read -r status _ location <<<"$(probe 'https://www.harpguru.com/s/x?a=1')"
  [[ "$status" == 301 && "$location" == 'https://harpguru.com/s/x?a=1' ]] \
    && pass "www to the apex, path and query kept" || fail "www: status $status, to '$location'"
  IFS='|' read -r status _ location <<<"$(probe 'http://harpguru.com/')"
  [[ "$status" == 301 && "$location" == https://harpguru.com/* ]] \
    && pass "HTTP to HTTPS" || fail "http: status $status, to '$location'"
fi

echo
if [[ $FAILED == 0 ]]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit $FAILED
