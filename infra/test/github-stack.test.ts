import { Template } from 'aws-cdk-lib/assertions'
import { CertificateStack } from '../lib/certificate-stack'
import { DnsStack } from '../lib/dns-stack'
import {
  GITHUB_ISSUER,
  GitHubStack,
  PAGES_DEPLOY_ROLE_NAME,
  PAGES_DEPLOY_SUBJECT,
  STS_AUDIENCE,
} from '../lib/github-stack'
import { SiteStack } from '../lib/site-stack'
import { appWithFlags } from './app'

const ACCOUNT = '111111111111'

// As the real app has them: the site in London, and this stack beside it.
const synth = () => {
  const app = appWithFlags()
  const env = { account: ACCOUNT, region: 'eu-west-2' }
  const dns = new DnsStack(app, 'Dns', { env })
  const certificate = new CertificateStack(app, 'Certificate', {
    env: { account: ACCOUNT, region: 'us-east-1' },
    zone: dns.zone,
  })
  const site = new SiteStack(app, 'Site', {
    env,
    zone: dns.zone,
    certificate: certificate.certificate,
  })
  const github = new GitHubStack(app, 'GitHub', {
    env,
    pagesBucket: site.pagesBucket,
    distribution: site.distribution,
  })
  return {
    template: Template.fromStack(github),
    site: Template.fromStack(site),
  }
}

type Statement = {
  Effect: string
  Action: string | string[]
  Resource: unknown
  Condition?: Record<string, Record<string, string>>
}

const role = (template: Template) => {
  const [r] = Object.values(template.findResources('AWS::IAM::Role')) as {
    Properties: Record<string, any>
  }[]
  return r.Properties
}

const permissions = (template: Template): Statement[] =>
  Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
    (p) => (p as any).Properties.PolicyDocument.Statement
  )

const actions = (s: Statement) => [s.Action].flat()

// A resource as JSON, to find which HarpguruSite resource it imports.
const imported = (resource: unknown) => JSON.stringify(resource)

test("one OIDC provider, for GitHub's issuer and STS's audience, with no custom resource", () => {
  const { template } = synth()
  template.resourceCountIs('AWS::IAM::OIDCProvider', 1)
  template.hasResourceProperties('AWS::IAM::OIDCProvider', {
    Url: `https://${GITHUB_ISSUER}`,
    ClientIdList: [STS_AUDIENCE],
  })
  template.resourceCountIs('AWS::Lambda::Function', 0)
})

test('one role, with a name of its own and one-hour sessions', () => {
  const { template } = synth()
  template.resourceCountIs('AWS::IAM::Role', 1)
  expect(role(template).RoleName).toBe(PAGES_DEPLOY_ROLE_NAME)
  expect(role(template).MaxSessionDuration).toBe(3600)
})

test('only a token for the harpguru.com environment of js-jslog/harpguru may assume it', () => {
  const { template } = synth()
  const [statement, ...others] = role(template).AssumeRolePolicyDocument
    .Statement as (Statement & { Principal: { Federated: unknown } })[]
  expect(others).toEqual([])
  expect(statement.Effect).toBe('Allow')
  expect(statement.Action).toBe('sts:AssumeRoleWithWebIdentity')
  // An OIDC provider's Ref is its ARN.
  expect(statement.Principal.Federated).toEqual({
    Ref: Object.keys(template.findResources('AWS::IAM::OIDCProvider'))[0],
  })
  // StringEquals, not StringLike: no wildcard reaches the subject.
  expect(statement.Condition).toEqual({
    StringEquals: {
      [`${GITHUB_ISSUER}:aud`]: STS_AUDIENCE,
      [`${GITHUB_ISSUER}:sub`]: PAGES_DEPLOY_SUBJECT,
    },
  })
  expect(PAGES_DEPLOY_SUBJECT).toBe(
    'repo:js-jslog/harpguru:environment:harpguru.com'
  )
})

test('it may list, put and delete in the pages bucket, and invalidate the distribution, and nothing else', () => {
  const { template, site } = synth()
  const statements = permissions(template)
  expect(statements.every((s) => s.Effect === 'Allow')).toBe(true)
  expect(statements.flatMap(actions).sort()).toEqual([
    'cloudfront:CreateInvalidation',
    's3:DeleteObject',
    's3:ListBucket',
    's3:PutObject',
  ])

  const pagesBucket = Object.keys(site.findResources('AWS::S3::Bucket')).find(
    (id) => id.startsWith('Pages')
  )!
  const distribution = Object.keys(
    site.findResources('AWS::CloudFront::Distribution')
  )[0]
  for (const s of statements) {
    const resource = imported(s.Resource)
    // Never a wildcard over a service, and never the site's own bucket.
    expect(resource).not.toMatch(/"\*"|Content/)
    expect(resource).toContain(
      actions(s)[0].startsWith('s3:') ? pagesBucket : distribution
    )
  }
  // Objects, not the bucket, for put and delete; the bucket, for list.
  const list = statements.find((s) => actions(s).includes('s3:ListBucket'))!
  expect(imported(list.Resource)).not.toContain('/*')
  const write = statements.find((s) => actions(s).includes('s3:PutObject'))!
  expect(imported(write.Resource)).toContain('/*')
})

test('outputs the role ARN, for the GitHub variable', () => {
  const { template } = synth()
  template.hasOutput('PagesDeployRoleArn', {})
})
