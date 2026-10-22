#!/usr/bin/env bash
# Deletes the default VPC in one region, with its subnets and internet
# gateway; its route table, security group and network ACL go with it.
# Refuses if any network interface is in the VPC, since that means something
# is using it. Without --yes it only prints what it would delete.
#
# Not recorded in any stack: docs/outside-cdk.md records each run.
#
#   AWS_PROFILE=harpguru scripts/delete-default-vpc.sh eu-west-2        # look
#   AWS_PROFILE=harpguru scripts/delete-default-vpc.sh eu-west-2 --yes  # delete
#
# `aws ec2 create-default-vpc --region <region>` makes a new one if ever needed.
set -euo pipefail

region=${1:?usage: delete-default-vpc.sh <region> [--yes]}
confirm=${2:-}
ec2() { aws ec2 --region "$region" "$@"; }

vpc=$(ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
if [ "$vpc" = None ]; then
  echo "$region: no default VPC"
  exit 0
fi

enis=$(ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$vpc" \
  --query 'length(NetworkInterfaces)' --output text)
if [ "$enis" != 0 ]; then
  echo "$region: $vpc has $enis network interface(s), so something uses it. Not deleting." >&2
  exit 1
fi

igws=$(ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$vpc" \
  --query 'InternetGateways[].InternetGatewayId' --output text)
subnets=$(ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" \
  --query 'Subnets[].SubnetId' --output text)

echo "$region: default VPC $vpc"
echo "  internet gateways: ${igws:-none}"
echo "  subnets: ${subnets:-none}"

if [ "$confirm" != --yes ]; then
  echo "  nothing deleted; run again with --yes to delete"
  exit 0
fi

for igw in $igws; do
  ec2 detach-internet-gateway --internet-gateway-id "$igw" --vpc-id "$vpc"
  ec2 delete-internet-gateway --internet-gateway-id "$igw"
done
for subnet in $subnets; do
  ec2 delete-subnet --subnet-id "$subnet"
done
ec2 delete-vpc --vpc-id "$vpc"
echo "  deleted"
