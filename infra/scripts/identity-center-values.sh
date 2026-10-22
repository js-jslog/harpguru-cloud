#!/usr/bin/env bash
# Prints the Organization and Identity Center values that deploy.local.json
# needs, as JSON to paste in. Read-only; needs `aws sso login`.
#
#   scripts/identity-center-values.sh [username]   # default: jslog
set -euo pipefail

username=${1:-jslog}

root_id=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
instance_arn=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
store_id=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)

permission_set_arn=
for arn in $(aws sso-admin list-permission-sets --instance-arn "$instance_arn" \
  --query 'PermissionSets[]' --output text); do
  name=$(aws sso-admin describe-permission-set --instance-arn "$instance_arn" \
    --permission-set-arn "$arn" --query 'PermissionSet.Name' --output text)
  if [ "$name" = AdministratorAccess ]; then permission_set_arn=$arn; fi
done
if [ -z "$permission_set_arn" ]; then
  echo "No AdministratorAccess permission set found" >&2
  exit 1
fi

principal_id=$(aws identitystore get-user-id --identity-store-id "$store_id" \
  --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"userName\",\"AttributeValue\":\"$username\"}}" \
  --query UserId --output text)

jq -n \
  --arg root "$root_id" --arg instance "$instance_arn" \
  --arg ps "$permission_set_arn" --arg principal "$principal_id" \
  '{organizationRootId: $root, identityCenterInstanceArn: $instance,
    adminPermissionSetArn: $ps, adminPrincipalId: $principal}'
