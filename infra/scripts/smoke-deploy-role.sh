#!/usr/bin/env bash
# Checks the role harpguru's deploy workflow assumes, and GitHub's OIDC
# provider, from this side. Run it after `cdk deploy HarpguruGitHub`, signed in
# to the workload account:
#
#   AWS_PROFILE=harpguru scripts/smoke-deploy-role.sh
#
# Every call is read-only. Permissions are checked with IAM's policy
# simulator, which evaluates the role's own policies against a request without
# making it. It can't present a GitHub token, so the trust policy is checked
# by reading it; the first run of harpguru's workflow is the test of that.
set -uo pipefail

ROLE=harpguru-pages-deploy
ISSUER=token.actions.githubusercontent.com
SUBJECT=repo:js-jslog/harpguru:environment:harpguru.com
FAILED=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }

output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) || exit 1
ROLE_ARN=$(output HarpguruGitHub PagesDeployRoleArn)
PAGES=$(output HarpguruSite PagesBucketName)
CONTENT=$(output HarpguruSite BucketName)
DISTRIBUTION=$(output HarpguruSite DistributionId)
if [[ -z "$ROLE_ARN" || "$ROLE_ARN" == None ]]; then
  echo "No PagesDeployRoleArn output: is HarpguruGitHub deployed, and AWS_PROFILE=harpguru set?"
  exit 1
fi

echo "The provider"
PROVIDER_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/$ISSUER"
audiences=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" \
  --query 'ClientIDList' --output text 2>/dev/null)
[[ "$audiences" == sts.amazonaws.com ]] && pass "$ISSUER, audience sts.amazonaws.com only" ||
  fail "$ISSUER: audiences '$audiences'"

echo "Who may assume $ROLE"
trust=$(aws iam get-role --role-name "$ROLE" --query 'Role.AssumeRolePolicyDocument' --output json)
jq -e --arg p "$PROVIDER_ARN" --arg i "$ISSUER" --arg s "$SUBJECT" '
  .Statement | length == 1 and (.[0] |
    .Effect == "Allow" and .Action == "sts:AssumeRoleWithWebIdentity" and
    .Principal == {Federated: $p} and
    .Condition == {StringEquals: {($i + ":aud"): "sts.amazonaws.com", ($i + ":sub"): $s}})
' <<<"$trust" >/dev/null && pass "only $SUBJECT, through the provider" ||
  fail "unexpected trust policy: $trust"

# One simulated request: "expected action resource".
simulate() {
  local expected=$1 action=$2 resource=$3 decision
  decision=$(aws iam simulate-principal-policy --policy-source-arn "$ROLE_ARN" \
    --action-names "$action" --resource-arns "$resource" \
    --query 'EvaluationResults[0].EvalDecision' --output text)
  [[ "$decision" == "$expected" ]] && pass "$action on ${resource#arn:aws:}: $decision" ||
    fail "$action on $resource: $decision, expected $expected"
}

echo "What it may do"
simulate allowed s3:ListBucket "arn:aws:s3:::$PAGES"
simulate allowed s3:PutObject "arn:aws:s3:::$PAGES/t/any/index.html"
simulate allowed s3:DeleteObject "arn:aws:s3:::$PAGES/w/any.js"
simulate allowed cloudfront:CreateInvalidation "arn:aws:cloudfront::$ACCOUNT:distribution/$DISTRIBUTION"

echo "What it may not"
simulate implicitDeny s3:GetObject "arn:aws:s3:::$PAGES/t/any/index.html"
simulate implicitDeny s3:PutBucketPolicy "arn:aws:s3:::$PAGES"
simulate implicitDeny s3:ListBucket "arn:aws:s3:::$CONTENT"
simulate implicitDeny s3:PutObject "arn:aws:s3:::$CONTENT/index.html"
simulate implicitDeny cloudfront:CreateInvalidation "arn:aws:cloudfront::$ACCOUNT:distribution/EXAMPLEOTHER"
simulate implicitDeny cloudfront:UpdateDistribution "arn:aws:cloudfront::$ACCOUNT:distribution/$DISTRIBUTION"
simulate implicitDeny iam:PassRole "$ROLE_ARN"

echo
if [[ $FAILED == 0 ]]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit $FAILED
