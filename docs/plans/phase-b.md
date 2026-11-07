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
| 1 | `1-pages`: the pages bucket, the `/t/`, `/s/`, `/e/` and `/w/` behaviours, their function, cache and headers policies | planned | — |
| 2 | `1-deploy-role`: the GitHub OIDC provider and the role `harpguru`'s workflow assumes | planned | #1; you: the environment name |
| 3 | `1-request-logs`: CloudFront access logs to S3 | planned | you: retention |
| 4 | `1-aasa-browser-marker`: `/s/*` excludes the open-in-browser marker | planned | the app side naming the marker |

**Next up, as of 2026-11-07:** merge this plan, then #1, which needs nothing from the app side
to begin: it is smoke-tested with placeholder pages.

## The work in `harpguru`, for reference

Not tracked here, but it shapes what is built here. From the roadmap's Phase B:

- export the harp face from `harpguru-core` as one composed component (blocks the widget)
- the widget, its three page types, and the URL format they share
- the 51 prerendered tuning pages
- the share button and QR code in the app; opening a link app first, with the harp-face choice
- the deploy workflow, which assumes #2's role

**What this side needs from that side:** the path prefix the widget's bundle is exported under
(#1), what its content security policy must allow (#1), the GitHub environment its deploy job
runs in (#2), and the open-in-browser marker (#4).

## Steps

**1 · `1-pages`.** All in `HarpguruSite`: the behaviours must hang off the existing
distribution, which is the point of having one.

- **A second bucket, `Pages`**, private, behind the same distribution with its own OAC origin.
  `harpguru`'s workflow owns its contents. It is separate because the site's
  `BucketDeployment` prunes its bucket: anything it did not upload, it deletes, so sharing
  would wipe the widget on the next `cdk deploy` here. Nothing in this repo uploads to it.
- **Four behaviours**, ahead of the default:

  | Path | Serves | Headers policy | Cached |
  | --- | --- | --- | --- |
  | `/w/*` | the widget's bundle and assets | pages | long: the filenames are hashed |
  | `/e/*` | one embed shell for every embed | embed | short; a deploy invalidates |
  | `/s/*` | one setup shell for every setup link | pages | short; a deploy invalidates |
  | `/t/*` | one prerendered page per tuning | pages | short; a deploy invalidates |

  `/w/` is provisional: it is whatever prefix the export uses, ideally one prefix for all of
  the bundle's files.
- **A viewer-request CloudFront Function maps a path to its object**: `/t/<slug>` to
  `/t/<slug>/index.html`, and anything under `/s/` or `/e/` to that path's one shell. A
  function rather than S3's website hosting, which does index documents but can't sit behind
  OAC.
- **The cache key ignores query strings.** The parameters are read by the bundle after load,
  so one cached copy of each page serves every configuration. They still reach the logs (#3).
- **Two new response headers policies.** Both keep the site policy's HSTS, `nosniff` and
  referrer policy, and differ in framing:
  - *pages*: `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
  - *embed*: no `X-Frame-Options`, which can't express a list, and
    `frame-ancestors 'self'` plus the partner allowlist. The list starts empty and lives in
    code: it is public by nature, being sent in every response.

  Their content security policy allows the bundle's own scripts, styles and fonts. Whether
  `react-native-web`'s injected styles need `'unsafe-inline'` is checked against a real export
  before this merges.
- **Smoke test:** placeholder pages uploaded by the script, then removed; `/t/x?k=C` and
  `/t/x?k=D` return one cached object; the embed is framed by a local page served from an
  allowlisted origin and refused from another.

**2 · `1-deploy-role`.** In the workload account: the GitHub OIDC identity provider, and one
role. No access keys anywhere.

- **Trust:** `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, subject
  `repo:js-jslog/harpguru:environment:<name>`. An environment rather than a branch, so its
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

- #2: the name of the GitHub environment `harpguru`'s deploy job runs in. `harpguru.com` is
  proposed.
- #3: how long request logs are kept. 90 days is proposed, enough for Phase D to start from.

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
- 2026-11-07: **the GitHub OIDC provider arrives in Phase B**, for `harpguru`'s deploys, not
  Phase F. The roadmap already required it in "How the two connect"; its Phase F line now
  covers this repo's own deploys. Proposed by the agent.
