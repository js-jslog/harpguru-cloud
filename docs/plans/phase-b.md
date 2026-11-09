# Phase B — The public harpface

The detailed plan for `harpguru-cloud`'s half of Phase B of the
[roadmap](https://github.com/js-jslog/harpguru/blob/178-build-the-harp-face-widget/roadmap-planning/roadmap.md#phase-b--the-public-harpface--30-hrs--both-repos).
The roadmap says what the phase is and why; this file says how this repo's part is being done
and how far it has got. **Ships:** harpguru.com serving the widget's three page types, `/t/`,
`/s/` and `/e/`, deployed from `harpguru` by a GitHub workflow holding no AWS keys.

Planned 2026-11-07, after the design was settled with the user the same day and recorded in
the roadmap: setup links are self-describing URLs made in the app, so **there is no API, no
DynamoDB and no WAF in this phase**. They move to Phase C.

## Status

Update this table in the PR that moves a row. **You** means the user.

| # | Step | Status | Blocked on |
| --- | --- | --- | --- |
| — | `1-phase-b-plan`: this file | **merged** 2026-11-07 | — |
| 1 | `1-pages`: the pages bucket, the `/t/`, `/s/`, `/e/` and `/w/` behaviours, their function, cache and headers policies | **merged** and deployed 2026-11-07; verified in a browser before the merge | — |
| 2 | `1-deploy-role`: the GitHub OIDC provider and the role `harpguru`'s workflow assumes | **merged** and deployed 2026-11-08; deployed and smoke-tested from the branch before the merge | — |
| 2a | GitHub settings in `js-jslog/harpguru`: the `harpguru.com` environment, and a variable holding `HarpguruGitHub`'s `PagesDeployRoleArn` output | **waiting on you**; not needed until `harpguru`'s deploy workflow exists | you |
| 3 | `1-request-logs`: CloudFront access logs to S3, kept 90 days | **built** 2026-11-09, on the branch; **waiting on you** to run `cdk diff` and `cdk deploy`, then the smoke test | you |
| 4 | `1-aasa-browser-marker`: `/s/*` excludes the open-in-browser marker | planned | the app side naming the marker |

**Next up, as of 2026-11-09:** #3's deploy from its branch, by you, then its smoke test; what
they show is committed to the branch before it merges. After that, #4 waits on the app side
naming its marker. Still open from #2: you make #2a's settings, and the trust policy has no real
test until `harpguru`'s first deploy workflow run. That workflow is `harpguru`'s work, and
deploys the widget once it exists.

## The work in `harpguru`, for reference

Not tracked here, but it shapes what is built here. From the roadmap's Phase B:

- export the harp face from `harpguru-core` as one composed component (blocks the widget)
- the widget, its three page types, and the URL format they share
- the 51 prerendered tuning pages
- the share button and QR code in the app; opening a link app first, with the harp-face choice
- the deploy workflow, which assumes #2's role

**What this side needs from that side:**

- #1, built: **the widget's export puts every file under `/w/`.** A default Expo web export
  uses two prefixes, `/_expo/` and `/assets/`; Expo's base URL setting moves both. Its pages
  are `t/<slug>/index.html`, `s/index.html` and `e/index.html` in the pages bucket.
- #1, built: **the content security policy the pages are served with**, in
  `infra/lib/site-stack.ts`: the bundle's own scripts and fonts, `data:` images, and inline
  styles. A change needs a deploy here.
- #1: **the workflow sets `Cache-Control` on upload**, long and immutable for `/w/`'s hashed
  files and `no-cache` for the HTML, and invalidates the HTML's paths after a deploy.
  CloudFront keeps copies a day otherwise.
- #2: the deploy job runs in the GitHub environment `harpguru.com`, with `id-token: write`
  permission, and assumes the role with `aws-actions/configure-aws-credentials` in
  `eu-west-2`. The role's ARN is `HarpguruGitHub`'s `PagesDeployRoleArn` output, kept in a
  GitHub variable; the bucket name and distribution ID are `HarpguruSite`'s
  `PagesBucketName` and `DistributionId` outputs. The role can list but not read objects:
  `aws s3 sync --delete` needs only that, comparing by size and time from the listing.
- #4: the open-in-browser marker.

## Steps

**1 · `1-pages`.** All in `HarpguruSite`: the behaviours must hang off the existing
distribution, which is the point of having one.

- **A second bucket, `Pages`**, private, behind the same distribution with its own OAC origin.
  `harpguru`'s workflow owns its contents. It is separate because the site's
  `BucketDeployment` prunes its bucket: anything it did not upload, it deletes, so sharing
  would wipe the widget on the next `cdk deploy` here. Nothing in this repo uploads to it.
- **Four behaviours**, ahead of the default:

  | Path | Serves | Headers policy |
  | --- | --- | --- |
  | `/w/*` | the widget's bundle and assets | pages |
  | `/t/*` | one prerendered page per tuning | pages |
  | `/s/*` | one setup shell for every setup link | pages |
  | `/e/*` | one embed shell for every embed | embed |

  How long each is cached is set by the upload's `Cache-Control`, so it is `harpguru`'s
  workflow's choice, within the cache policy below.
- **A viewer-request CloudFront Function maps a path to its object**: `/t/<slug>` to
  `/t/<slug>/index.html`, and anything under `/s/` or `/e/` to that path's one shell. A
  function rather than S3's website hosting, which does index documents but can't sit behind
  OAC.
- **The `www` redirect has to cover the new paths too.** It was attached to the default
  behaviour only, so `www.harpguru.com/t/…` would have been served on `www`, not redirected. A
  behaviour takes one viewer-request function, so the redirect and the mapping are one
  function, `harpguru-viewer-request`, on every behaviour, replacing `harpguru-www-redirect`.
  It also adds the missing slash to `/t`, `/s` and `/e`.
- **The cache key ignores query strings**: AWS's managed `CachingOptimized` policy, which the
  default behaviour already had as CDK's default. The parameters are read by the bundle after
  load, so one cached copy of each page serves every configuration. They still reach the logs
  (#3).
- **Two new response headers policies.** Both keep the site policy's HSTS, `nosniff` and
  referrer policy, and differ in framing:
  - *pages*: `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
  - *embed*: no `X-Frame-Options`, which can't express a list, and
    `frame-ancestors 'self'` plus the partner allowlist. The list starts empty and lives in
    code: it is public by nature, being sent in every response.

  Their content security policy allows the bundle's own scripts and fonts, `data:` images,
  and inline styles, and no `eval`. Checked 2026-11-07 against a real web export of the app,
  a superset of the widget: `index.html` carries an inline `<style>` and react-native-web
  writes styles at run time, so styles need `'unsafe-inline'`; the bundle's two `eval` calls
  can't run in a browser; its fonts are its own `.ttf` files. A static check only: the
  widget's first deploy is the test in a browser.
- **Deployed 2026-11-07**, from the branch, before merging: 70 seconds of stack time. Only
  the function was replaced: CloudFormation made the new one, pointed every behaviour at it,
  then deleted the old one. The
  distribution was `Deployed` within minutes. `scripts/smoke-site.sh` and
  `scripts/smoke-pages.sh` both passed; the bucket was empty again afterwards. With
  `--pause`, a local page framing `/e/` was refused by the browser: "The page's settings blocked
  the loading of a resource (frame-ancestors) … because it violates the following directive:
  'frame-ancestors 'self''".
- **Smoke test, `scripts/smoke-pages.sh`:** placeholder pages uploaded by the script, then
  removed, and any real page left as it is. `/t/x?k=C` then
  `/t/x?k=D` is a cache hit the second time; `/s/` and `/e/` with any path or query return
  their shell; `www` redirects on every path; each path carries its own policy's headers.
  In a browser, a local page framing `/e/` is refused, its origin not being on the empty
  allowlist: `--pause` holds the placeholders up and prints that page. Allowing an origin is
  tested when the first partner is added.

**2 · `1-deploy-role`.** In the workload account: the GitHub OIDC identity provider, and one
role. No access keys anywhere.

- **Trust:** `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, subject
  `repo:js-jslog/harpguru:environment:harpguru.com`. An environment rather than a branch, so its
  protection rules in GitHub decide who may deploy, and no other workflow in the repo can.
- **Permissions:** list, put and delete in the `Pages` bucket only, and
  `cloudfront:CreateInvalidation` on this distribution only.
- **The role's ARN goes into `harpguru` as a GitHub variable**, not into either repo's files:
  it carries the account ID.
- **Built 2026-11-08** as a stack of its own, `HarpguruGitHub`, in London beside the site: the
  provider is one per issuer per account, and Phase F's role for this repo's deploys will trust
  it too. The bucket and distribution arrive as weak cross-stack references, so `HarpguruSite`
  gains only two outputs: the pages bucket's ARN and the distribution's ID, with generated names
  starting `PublishOutput`. The two the workflow reads are older: `PagesBucketName`, from step
  1, and `DistributionId`, from Phase A's step 8. The role is named, `harpguru-pages-deploy`.
  The provider is the native `AWS::IAM::OIDCProvider`, with no thumbprints and no custom
  resource. The role may also `s3:AbortMultipartUpload` on the bucket's objects: the CLI uploads
  files over 8 MB in parts, and when one fails it aborts, which would otherwise be denied and
  leave the parts in the bucket, billed, with no lifecycle rule to remove them.
- **Deployed 2026-11-08**, from the branch, before merging: 43 seconds of stack time.
  `HarpguruSite` gained only its two outputs. `scripts/smoke-deploy-role.sh` passed all 13
  checks. Given no thumbprint, IAM recorded one itself. CDK's approval prompt for the IAM
  changes can't be answered from Claude Code's `!` prompt, so the deploy ran with
  `--require-approval never`, after the diff was read.
- **Smoke test, `scripts/smoke-deploy-role.sh`:** read-only. It reads the provider and the trust
  policy, and asks IAM's policy simulator what the role may do: list, put, delete and abort
  uploads in the pages bucket and invalidate the distribution, but not read objects, touch the
  site's bucket, invalidate another distribution or change this one. The simulator can't present
  a GitHub token, so the trust policy's real test is `harpguru`'s first workflow run.

**3 · `1-request-logs`.** CloudFront's standard logs, delivered to an S3 bucket in the workload
account, with a lifecycle rule deleting them after the retention the user chooses.

- They hold viewers' IP addresses. Phase D turns them into anonymous aggregates; until then
  they are personal data, which is the case for a short retention.
- **Verified 2026-11-09, before building:** standard logging (v2) delivers through CloudWatch
  Logs' vended delivery, as three resources: a delivery source, the distribution; a delivery
  destination, the bucket; and a delivery joining them. CloudFront's guide says all three are
  made in `us-east-1`, whatever region the bucket is in, so they get a small edge stack, and the
  bucket can stay in London. The legacy logging was ruled out: it writes with ACLs, which every
  bucket here has switched off. The account had no delivery source yet.
- **Built 2026-11-09.** The bucket, `RequestLogs`, is in `HarpguruSite`, beside the
  distribution: private, TLS only, SSE-S3, ACLs off, and a lifecycle rule deleting each file
  after 90 days. The delivery is a new stack, `HarpguruRequestLogsEdge`, in `us-east-1`, reading
  the distribution's ID from London as a weak reference; `HarpguruSite` already publishes it, for
  `HarpguruGitHub`, so it gains only the bucket, its policy and a `RequestLogsBucketName` output.
  - **Where:** under `cloudfront/` in the bucket, one Hive-style folder per day, expected to
    be `cloudfront/year=2026/month=11/day=09/`, so Phase D's Athena table can take its
    partitions from the path. The documentation shows only `{yyyy}` becoming `year=`; the smoke
    test checks the rest. For CloudFront, a prefix on the destination replaces the default
    `AWSLogs/<account id>/CloudFront/`, which keeps the account ID out of the keys.
  - **Format:** JSON, expected as one object per line, read by Athena as it is. Whether the
    files are compressed is for the deploy to show; the smoke test reads either.
    A destination's format can't be changed once made; Parquet would mean a new one.
  - **Fields:** CloudFront's defaults, read from the account with
    `aws logs describe-configuration-templates`, without cookies, which the site doesn't set,
    and with `c-country` and `cache-behavior-path-pattern` added, which aren't defaults and
    which Phase D's counts need.
  - **The bucket policy is CDK's.** If a delivery finds no statement it recognises, it adds its
    own to the bucket's policy, which the next deploy of `HarpguruSite` would remove. So CDK
    writes the two statements the CloudWatch guide gives, limited to this account's one source,
    `harpguru-request-logs`, and to `cloudfront/*`. Whether the delivery recognises them is for
    the deploy to show: the smoke test lists the policy's statements.
  - **The bucket's name is generated by CDK**, not CloudFormation: CDK's `Bucket` refuses to
    be used from another region unless its name is known at synthesis. The distribution's ID
    crosses as a weak reference without that, because `Distribution` builds its ARN from it.
- **Smoke test, `scripts/smoke-request-logs.sh`:** reads the source, delivery and destination in
  `us-east-1`, the bucket's lifecycle rule and policy in London, then requests
  `/?smoke-request-logs=<marker>` and waits, 20 minutes by default, for that request's line to
  land. How long delivery takes is unknown until then. It checks the folders, that the line is
  JSON and which fields it has, and prints it without the IP address, port, forwarded-for
  address or user agent.
- **Deploy:** `HarpguruSite` first, then `HarpguruRequestLogsEdge`; CDK orders them itself if
  both are named. The site's change only adds resources: the distribution is not touched,
  because v2 logging is configured outside it.
- **Cost:** CloudFront's guide says delivery to S3 is free, and CloudWatch's says vended delivery
  to S3 is billed per GB. At a few megabytes a month either is nothing; the bill will say which.

**4 · `1-aasa-browser-marker`.** The `/s/*` component in `apple-app-site-association` gains an
exclusion for the marker the app adds when the user chooses to open a setup in the browser.
Nothing else in this repo changes: Android's paths live in the app's intent filters. Whether
Android can exclude by query parameter is unverified; if not, the marker becomes a path, and
this step adds that path's behaviour instead.

## Cost

Near nothing over Phase A: a second bucket's storage, CloudFront Function invocations at
$0.10 per million, and a few megabytes of logs a month. No new fixed monthly charge.

## Inputs needed from the user

- **#2a, the GitHub settings**, above. Needed before `harpguru`'s first deploy workflow run,
  not before #3. The ARN contains the account ID, so it goes in a GitHub variable, never a file;
  `aws cloudformation describe-stacks --stack-name HarpguruGitHub --profile harpguru --query 'Stacks[0].Outputs'`
  prints it.
- Received 2026-11-07: #2's GitHub environment is **`harpguru.com`**; #3's logs are kept
  **90 days**.

## Decisions

- 2026-11-07: **setup links are self-describing URLs, made by a share button in the app.**
  No API, DynamoDB or WAF in Phase B; they move to Phase C, where tuning documents need them.
  The user's choice; the reasoning is in the roadmap's "Settled since writing".
- 2026-11-07: **configuration and cell interaction never share a page**; `/t/` validates its
  parameters against its own option lists. The user's choice; the table is in the roadmap's
  locked decisions.
- 2026-11-07: **links open the app first**, which asks where the setup goes or hands it to the
  browser. The user's choice.
- 2026-11-07: **the pages get a second bucket**, so the site's pruning upload can never delete
  them. Proposed by the agent.
- 2026-11-07: **the deploy job runs in a GitHub environment named `harpguru.com`, and request
  logs are kept 90 days.** Proposed by the agent, accepted by the user.
- 2026-11-07: **one viewer-request function on every behaviour**, `harpguru-viewer-request`,
  replacing `harpguru-www-redirect`, because a behaviour takes only one, and every one needs the
  redirect. Proposed by the agent.
- 2026-11-07: **every behaviour uses the managed `CachingOptimized` policy**, rather than a
  custom one with a short TTL: cache lifetimes are set per file by `harpguru`'s upload, and its
  deploys invalidate. Proposed by the agent.
- 2026-11-07: **request logs arrive in Phase B's step 3**, overtaking Phase A's 2026-11-06
  choice of none until Phase D: counting which setups and embeds are opened is now what makes
  the logs worth reading. Settled with the user's 90-day retention, above.
- 2026-11-07: **the GitHub OIDC provider arrives in Phase B**, for `harpguru`'s deploys, not
  Phase F. The roadmap already required it in "How the two connect"; its Phase F line now
  covers this repo's own deploys. Proposed by the agent.
- 2026-11-08: **the provider and role get a stack of their own, `HarpguruGitHub`**, rather than
  joining `HarpguruSite`: the provider is account-wide and outlives any one site. Proposed by
  the agent.
- 2026-11-08: **the deploy role may also abort multipart uploads** in the pages bucket, beyond
  the planned list, put and delete, so a failed upload of a file over 8 MB leaves nothing
  billed behind. Proposed by the agent in the branch review, accepted by the user.
- 2026-11-09: **request logs use standard logging (v2), delivered from a stack of its own in
  `us-east-1`, `HarpguruRequestLogsEdge`, to a bucket in London in `HarpguruSite`.** The legacy
  logging needs bucket ACLs, which are off everywhere here. Proposed by the agent.
- 2026-11-09: **the logs are JSON, filed by day in Hive-style folders, with CloudFront's default
  fields less cookies, plus the country and the behaviour's path pattern.** JSON over Parquet
  because it can be read by eye, and nothing at this scale needs Parquet's cheaper scans; Phase D
  can change it with a new destination. Proposed by the agent.
