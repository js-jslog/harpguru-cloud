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
| — | `1-phase-b-plan`: this file | **in review** | you: open the PR |
| 1 | `1-pages`: the pages bucket, the `/t/`, `/s/`, `/e/` and `/w/` behaviours, their function, cache and headers policies | **deployed** 2026-11-07 from the branch; smoke test passed; in review | you: the framing check, `scripts/smoke-pages.sh --pause`, then merge |
| 2 | `1-deploy-role`: the GitHub OIDC provider and the role `harpguru`'s workflow assumes | planned | #1 |
| 3 | `1-request-logs`: CloudFront access logs to S3, kept 90 days | planned | — |
| 4 | `1-aasa-browser-marker`: `/s/*` excludes the open-in-browser marker | planned | the app side naming the marker |

**Next up, as of 2026-11-07:** check #1's framing in a browser and merge it. Then #2.

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
- #2: the deploy job runs in the GitHub environment `harpguru.com`.
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
- **Deployed 2026-11-07**, from the branch, before merging: 70 seconds of stack time, nothing
  replaced but the function, which CloudFormation made, swapped in and then deleted. The
  distribution was `Deployed` within minutes. `scripts/smoke-site.sh` and
  `scripts/smoke-pages.sh` both passed; the bucket was empty again afterwards.
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

**3 · `1-request-logs`.** CloudFront's standard logs, delivered to an S3 bucket in the workload
account, with a lifecycle rule deleting them after the retention the user chooses.

- They hold viewers' IP addresses. Phase D turns them into anonymous aggregates; until then
  they are personal data, which is the case for a short retention.
- **To verify before building:** the current standard logging delivers through CloudWatch Logs'
  vended delivery, and its delivery source may have to be made in `us-east-1`, which would
  mean a small edge stack. The legacy logging writes straight to a bucket, but needs bucket
  ACLs switched back on.

**4 · `1-aasa-browser-marker`.** The `/s/*` component in `apple-app-site-association` gains an
exclusion for the marker the app adds when the user chooses to open a setup in the browser.
Nothing else in this repo changes: Android's paths live in the app's intent filters. Whether
Android can exclude by query parameter is unverified; if not, the marker becomes a path, and
this step adds that path's behaviour instead.

## Cost

Near nothing over Phase A: a second bucket's storage, CloudFront Function invocations at
$0.10 per million, and a few megabytes of logs a month. No new fixed monthly charge.

## Inputs needed from the user

- None outstanding.
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
- 2026-11-07: **the GitHub OIDC provider arrives in Phase B**, for `harpguru`'s deploys, not
  Phase F. The roadmap already required it in "How the two connect"; its Phase F line now
  covers this repo's own deploys. Proposed by the agent.
