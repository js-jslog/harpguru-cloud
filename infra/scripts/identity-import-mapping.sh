#!/usr/bin/env bash
# Prints the resource mapping `cdk import HarpguruIdentity` needs: the
# identifiers of the console-made permission set and management account
# assignment, keyed by their logical IDs. Read-only; needs `aws sso login`
# and a filled-in deploy.local.json.
#
#   npx cdk import HarpguruIdentity \
#     --resource-mapping-inline "$(scripts/identity-import-mapping.sh)"
set -euo pipefail

config=$(dirname "$0")/../deploy.local.json
instance=$(jq -r .identityCenterInstanceArn "$config")
permission_set=$(jq -r .adminPermissionSetArn "$config")
principal=$(jq -r .adminPrincipalId "$config")
account=$(aws sts get-caller-identity --query Account --output text)

jq -cn \
  --arg instance "$instance" --arg ps "$permission_set" \
  --arg principal "$principal" --arg account "$account" \
  '{AdministratorAccess: {InstanceArn: $instance, PermissionSetArn: $ps},
    ManagementAdminAccess: {InstanceArn: $instance, PermissionSetArn: $ps,
      PrincipalType: "USER", PrincipalId: $principal,
      TargetType: "AWS_ACCOUNT", TargetId: $account}}'
