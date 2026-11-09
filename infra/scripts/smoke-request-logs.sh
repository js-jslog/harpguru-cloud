#!/usr/bin/env bash
# Checks harpguru.com's request logs, end to end. Run it after
# `cdk deploy HarpguruSite HarpguruRequestLogsEdge`, signed in to the workload
# account:
#
#   AWS_PROFILE=harpguru scripts/smoke-request-logs.sh
#   AWS_PROFILE=harpguru scripts/smoke-request-logs.sh --wait 30
#
# It reads the delivery's three parts in us-east-1 and the bucket's rules in
# London, then makes one request to harpguru.com with a marker in its query
# string and waits for that request's log line to land in the bucket: 20
# minutes by default, or --wait's number. Nothing is written but the request
# and its log. The line is printed without its IP address, port or user agent,
# so the output can be pasted.
set -uo pipefail

WAIT_MINUTES=20
case "${1:-}" in
  '') ;;
  --wait) WAIT_MINUTES=${2:?usage: $0 [--wait MINUTES]} ;;
  *) echo "usage: $0 [--wait MINUTES]"; exit 2 ;;
esac

SOURCE=harpguru-request-logs
PREFIX=cloudfront
EDGE=us-east-1
FAILED=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }

output() {
  aws cloudformation describe-stacks --stack-name HarpguruSite \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || exit 1
BUCKET=$(output RequestLogsBucketName)
DISTRIBUTION=$(output DistributionId)
if [[ -z "$BUCKET" || "$BUCKET" == None ]]; then
  echo "No RequestLogsBucketName output: is HarpguruSite deployed, and AWS_PROFILE=harpguru set?"
  exit 1
fi
# A value as printed: without the account ID, in case the output is pasted.
shown() { echo "${1//$ACCOUNT/<account>}"; }

echo "The delivery, in $EDGE"
source_json=$(aws logs get-delivery-source --name "$SOURCE" --region "$EDGE" \
  --query deliverySource --output json 2>/dev/null)
jq -e --arg d "arn:aws:cloudfront::$ACCOUNT:distribution/$DISTRIBUTION" '
  .logType == "ACCESS_LOGS" and .resourceArns == [$d]
' <<<"${source_json:-null}" >/dev/null &&
  pass "source $SOURCE: the access logs of $DISTRIBUTION" ||
  fail "source $SOURCE: $(shown "${source_json:-missing}")"

delivery=$(aws logs describe-deliveries --region "$EDGE" --output json |
  jq --arg s "$SOURCE" '[.deliveries[] | select(.deliverySourceName == $s)]')
if jq -e 'length == 1' <<<"$delivery" >/dev/null; then
  delivery=$(jq '.[0]' <<<"$delivery")
  jq -e '.deliveryDestinationType == "S3"
    and .s3DeliveryConfiguration.enableHiveCompatiblePath == true
    and .s3DeliveryConfiguration.suffixPath == "{yyyy}/{MM}/{dd}"' <<<"$delivery" >/dev/null &&
    pass "one delivery, to S3, by day in Hive-style folders" ||
    fail "delivery: $(shown "$(jq -c '{deliveryDestinationType, s3DeliveryConfiguration}' <<<"$delivery")")"
  jq -e '(.recordFields | index("cs(Cookie)") | not)
    and (.recordFields | index("c-country"))
    and (.recordFields | index("cache-behavior-path-pattern"))' <<<"$delivery" >/dev/null &&
    pass "its fields: no cookies; the country and the behaviour's path pattern" ||
    fail "fields: $(jq -c .recordFields <<<"$delivery")"
  destination_arn=$(jq -r .deliveryDestinationArn <<<"$delivery")
  destination=$(aws logs get-delivery-destination --region "$EDGE" \
    --name "${destination_arn##*:}" --query deliveryDestination --output json)
  jq -e --arg b "arn:aws:s3:::$BUCKET/$PREFIX" '
    .outputFormat == "json" and .deliveryDestinationConfiguration.destinationResourceArn == $b
  ' <<<"$destination" >/dev/null &&
    pass "destination: JSON, to $BUCKET/$PREFIX" ||
    fail "destination: $(shown "$(jq -c . <<<"$destination")")"
else
  fail "expected one delivery from $SOURCE, found $(jq length <<<"$delivery")"
fi

echo "The bucket, in London"
expiry=$(aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --query "Rules[?Status=='Enabled'].Expiration.Days" --output text 2>/dev/null)
[[ "$expiry" == 90 ]] && pass "files are deleted after 90 days" ||
  fail "lifecycle expiry: '${expiry:-none}'"
# The delivery adds its own statement to the bucket policy if it finds none it
# recognises. CDK's are meant to be recognised; this says whether they were.
sids=$(aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text |
  jq -r '[.Statement[].Sid // "(none)"] | sort | join(", ")')
[[ "$sids" == "(none), AWSLogDeliveryAclCheck, AWSLogDeliveryWrite" ]] &&
  pass "the policy is CDK's alone: TLS only, and the delivery's two statements" ||
  fail "policy statements: $sids; the delivery may have added its own"

echo "One request, end to end"
MARKER="smoke-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
status=$(curl -s -o /dev/null -w '%{http_code}' "https://harpguru.com/?smoke-request-logs=$MARKER")
[[ "$status" == 200 ]] && pass "requested /?smoke-request-logs=$MARKER: 200" ||
  fail "requested /?smoke-request-logs=$MARKER: $status"

echo "  ..    waiting up to $WAIT_MINUTES minutes for its log line"
asked=$SECONDS
deadline=$((asked + WAIT_MINUTES * 60))
seen=''
found=''
while ((SECONDS < deadline)) && [[ -z "$found" ]]; do
  keys=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/" \
    --query "Contents[?LastModified>='$STARTED'].Key" --output text 2>/dev/null)
  for key in $keys; do
    [[ "$key" == None || " $seen " == *" $key "* ]] && continue
    seen="$seen $key"
    line=$(aws s3 cp "s3://$BUCKET/$key" - 2>/dev/null | { gzip -dc 2>/dev/null || cat; } |
      grep -F "$MARKER" | head -n 1)
    if [[ -n "$line" ]]; then
      found=$key
      break
    fi
  done
  [[ -z "$found" ]] && sleep 30
done

if [[ -z "$found" ]]; then
  fail "no log line with $MARKER after $WAIT_MINUTES minutes; files seen since the request:${seen:- none}"
else
  pass "its line arrived within $(( (SECONDS - asked + 59) / 60 )) minutes, in $found"
  [[ "$found" =~ ^$PREFIX/year=[0-9]{4}/month=[0-9]{2}/day=[0-9]{2}/ ]] &&
    pass "filed under $PREFIX/year=/month=/day=/" ||
    fail "unexpected folders: $found"
  if jq -e . <<<"$line" >/dev/null 2>&1; then
    pass "the line is JSON"
    jq -e 'has("c-country") and has("cache-behavior-path-pattern") and (has("cs(Cookie)") | not)' \
      <<<"$line" >/dev/null &&
      pass "it carries the country and the behaviour, and no cookies" ||
      fail "fields: $(jq -c 'keys' <<<"$line")"
    echo "  The line, without the IP address, port and user agent:"
    jq 'del(."c-ip", ."c-port", ."x-forwarded-for", ."cs(User-Agent)")' <<<"$line" | sed 's/^/    /'
  else
    fail "the line is not JSON: it starts '${line:0:60}'"
  fi
fi

echo
if ((FAILED)); then
  echo "Some checks FAILED."
  exit 1
fi
echo "All checks passed."
