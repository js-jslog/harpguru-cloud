import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront'
import {
  OidcProviderNative,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from 'aws-cdk-lib/aws-iam'
import type { IBucket } from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

// GitHub's token issuer. One IAM provider per issuer per account, so every
// role a GitHub workflow assumes, now or in Phase F, trusts this one.
export const GITHUB_ISSUER = 'token.actions.githubusercontent.com'
// The audience aws-actions/configure-aws-credentials asks GitHub to put in
// the token. The provider accepts no other.
export const STS_AUDIENCE = 'sts.amazonaws.com'

// Only a job in this environment of this repo may assume the role. GitHub
// writes the token's subject from the job: an environment, not a branch, so
// the environment's protection rules in GitHub decide who may deploy, and no
// other workflow, branch or fork can.
export const PAGES_DEPLOY_SUBJECT =
  'repo:js-jslog/harpguru:environment:harpguru.com'
export const PAGES_DEPLOY_ROLE_NAME = 'harpguru-pages-deploy'

export type GitHubStackProps = StackProps & {
  // From HarpguruSite, as weak cross-stack references: plain outputs there,
  // read here with Fn::GetStackOutput, so nothing locks HarpguruSite.
  pagesBucket: IBucket
  distribution: IDistribution
}

// How GitHub Actions reaches this account: an OIDC identity provider, and the
// role harpguru's deploy workflow assumes with a token from it. No access
// keys exist anywhere. The workflow swaps a token GitHub signs for an hour of
// the role's credentials, and the trust policy checks which repo and
// environment the token was issued to.
//
// Not termination protected: everything in it is rebuilt by a deploy, and
// deleting it only stops harpguru's deploys until it is back.
export class GitHubStack extends Stack {
  readonly provider: OidcProviderNative
  readonly pagesDeployRole: Role

  constructor(scope: Construct, id: string, props: GitHubStackProps) {
    super(scope, id, props)

    // The native CloudFormation resource, not CDK's older custom resource.
    // No thumbprints: IAM records one itself, and for GitHub doesn't use it,
    // checking the certificate against its own trusted root CAs instead.
    this.provider = new OidcProviderNative(this, 'Provider', {
      url: `https://${GITHUB_ISSUER}`,
      clientIds: [STS_AUDIENCE],
    })

    this.pagesDeployRole = new Role(this, 'PagesDeploy', {
      roleName: PAGES_DEPLOY_ROLE_NAME,
      description:
        "Assumed by harpguru's deploy workflow to publish the widget's pages",
      assumedBy: new WebIdentityPrincipal(this.provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_ISSUER}:aud`]: STS_AUDIENCE,
          [`${GITHUB_ISSUER}:sub`]: PAGES_DEPLOY_SUBJECT,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    })

    // What `aws s3 sync --delete` needs: list to compare, put and delete to
    // change. On the pages bucket only: the site's bucket stays this repo's.
    this.pagesDeployRole.addToPolicy(
      new PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [props.pagesBucket.bucketArn],
      })
    )
    this.pagesDeployRole.addToPolicy(
      new PolicyStatement({
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: [props.pagesBucket.arnForObjects('*')],
      })
    )
    // So a deploy's new HTML shows at once, not when the cached copy expires.
    this.pagesDeployRole.addToPolicy(
      new PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [props.distribution.distributionArn],
      })
    )

    // For harpguru's workflow, as a GitHub variable: it carries the account
    // ID, so it goes into GitHub's settings, not either repo. The bucket name
    // and distribution ID it also needs are HarpguruSite's outputs.
    new CfnOutput(this, 'PagesDeployRoleArn', {
      value: this.pagesDeployRole.roleArn,
    })
  }
}
