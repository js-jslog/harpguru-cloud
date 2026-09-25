# harpguru-cloud — orientation

You are working in the AWS half of a two-repo project. This file exists so that an agent
starting here knows what this repo is for, where the plan lives, and which instincts to
distrust. **It is not the plan.** Read the plan before doing anything.

## Read these first, end to end

- [The AWS pathway roadmap](https://github.com/js-jslog/harpguru/blob/master/roadmap-planning/roadmap.md)
  — the decisions, the sequence, the scope.
- [AWS pathway technical findings](https://github.com/js-jslog/harpguru/blob/master/roadmap-planning/aws-pathway-findings.md)
  — verified facts, the domain vocabulary, the tuning data model.

**The decisions section matters more than the phase list.** Most plausible-looking proposals
have already been considered and rejected for reasons that are not visible in any code. A
proposal that looks obviously right is the most likely to have been ruled out already.

Anything in the findings document carrying a date should be re-verified before it is relied
on, and re-verifying it means updating that document — see below.

## What this repo is, and what it must never gain

It holds CDK, the API, pipelines and analytics. It is a fork of
[`devcontainer-aws-base`](https://github.com/js-jslog/devcontainer-aws-base); its
`docs/aws-conventions.md` is the container convention you inherit.

**It must never gain harmonica domain code.** The API treats a tuning as an opaque document
validated against a versioned JSON Schema — array lengths, integers in range. It never needs
to know what a Paddy Richter is. The schema is the *only* shared artefact, copied into both
repos.

This is not fastidiousness. The domain packages are unscoped, `UNLICENSED`, and their `main`
points at raw TypeScript with no build step, so sharing them across repos would mean solving
publication first — hours of non-AWS work for a dependency the architecture does not need.
The app repo, equally, must never gain AWS tooling.

## Two things that will be got wrong by default

**Findings go back to `harpguru`, not here.** When work in this repo establishes a fact worth
keeping — a service behaves unexpectedly, a documented assumption turns out false, a cost is
not what was assumed — commit it to `roadmap-planning/aws-pathway-findings.md` in
`js-jslog/harpguru`. The natural instinct is to write notes where you are working. Resist it:
one history, one place to check.

**Do not copy the roadmap here.** This file points at it deliberately. Two copies of a
directing document drift, and the reader who loses is the one who does not know theirs is
stale. If the roadmap is wrong, fix it there.

## Working with the app repo from here

Clone `js-jslog/harpguru` to **`/harpguru`** — outside `/app`, which is this repo's
workspace. The separation is the point: a sibling at the filesystem root cannot be staged
into a commit here by accident, and it does not depend on a gitignore rule continuing to
hold. Do not put it under `/app`.

That gives you the roadmap and the findings document in a working tree rather than over
HTTP — fresher, and readable without a network round trip — and, more importantly, a place
to commit discoveries back to.

**The clone is ephemeral.** `/` is the container's writable layer, not a mounted volume, so
a rebuild loses it. Re-clone; do not accumulate uncommitted work there. If it ever needs to
survive rebuilds it wants its own named volume in the `mounts` array, and `purge` will not
find that volume unless it is listed alongside the others — the same trap as the credential
volumes. Re-cloning is the better default anyway: a stale checkout of a directing document
is the exact failure this arrangement exists to prevent.

### Pushing from here

`harpguru`'s `.husky/pre-push` runs `check-release-version.py`, then `yarn lint`, `yarn tsc`
and `yarn test`. This container has Node and pnpm but **no yarn**, and the clone has no
`node_modules`, so the hook cannot run. There is no pre-commit hook, so committing is fine.

**Markdown-only changes under `roadmap-planning/` may be pushed with `--no-verify`.** That is
narrow and it is justified by what the hook actually checks: `eslint --ext .ts,.tsx`, `tsc`,
`jest`, and a version check against `app.json`. A commit touching only markdown cannot
regress any of them.

**Anything touching code goes through the app container instead**, where the hook runs
properly. The risk here was never that a markdown push breaks something — it cannot — it is
that `--no-verify` becomes a habit that outlives its justification. If you find yourself
reaching for it on a change that is not markdown, that is the signal to stop and move the
work.

Git credentials need no setup. The base Dockerfile installs **Git Credential Manager 2.4.1**,
runs `git-credential-manager configure`, and sets `credential.credentialStore plaintext`
globally, so authenticating to GitHub works out of the box and the stored credential survives
rebuilds along with the rest of `/home/dev`. Note the store is plaintext by deliberate choice
— it is a disposable development container, but it is worth knowing rather than discovering.

## How work arrives

An agent takes **one phase** and produces a granular plan for it, having read both documents
first. That plan becomes one or more pull requests. **No phase is planned in detail before
the phase preceding it has shipped** — each one ships something real, and what it teaches
changes the next estimate.

This repo carries its own umbrella issue, which references `js-jslog/harpguru#178`. PRs for
cloud work land against that issue, not against the one in the app repo.

## Which phases are yours

| Phase | `harpguru` | `harpguru-cloud` |
| --- | --- | --- |
| A — Ground the domain | the browser spike (**done**) | everything else |
| B — The public harpface | widget, tuning pages, deep-link config | API, DynamoDB, CloudFront, routing |
| C — The tuning workbench | creator UI, `TuningIds` widening | schema, validation, Step Functions |
| D — Demand signal | telemetry emission in the app | ingestion, Athena, reporting |
| E — Verified publishers | — | Cognito, publisher console |
| F — Harden and migrate | — | everything |

## Locked decisions you are most likely to trip over

Full list in the roadmap. These are the ones reachable from inside this repo:

- **CDK is primary. Terraform is for deliberate labs only** — EKS, Transit Gateway,
  multi-region — that the product will never need, torn down the same session. **Never build
  the same thing twice.**
- **Java arrives as a migration, never as a first implementation.** The API ships in
  TypeScript and is rewritten onto Fargate behind an unchanged contract in Phase F. Never
  duplicate logic to manufacture a Java opportunity.
- **Identity is web-only, invitation-only, MFA mandatory.** No self-service signup, ever. The
  app performs unauthenticated reads and never learns what a publisher is beyond a boolean in
  a document. This keeps Apple guidelines 4.8 and 5.1.1(v) permanently untriggered, which is
  a permanent exemption rather than a temporary dodge — do not build anything that would
  require the app to authenticate.
- **Do not publish the domain packages to npm.**
- **Budget alarm before the first deploy.** Not after it.
- **No mobile release pipeline here.** One exists in the app repo, built for its own reasons;
  that does not make it this project's concern.

## Facts that bite

- **Region is `eu-west-2`** — but the CloudFront certificate must be issued in `us-east-1`
  regardless of where the rest of the stack lives.
- **harpguru.com is registered through Heart Internet**, parked on a shared IP with no HTTPS
  at all. Nothing live depends on it. **Delegate to a Route 53 hosted zone rather than
  transferring** the registration.
- **`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` must be
  served as JSON over HTTPS with no redirects.** Universal Links and Android App Links both
  require it, so nothing in Phase B works without it. This is the hard prerequisite hiding
  inside Phase A.
- **One CloudFront distribution, several behaviours** — apex to marketing, `/t/*` to tuning
  pages, `/e/*` to embeds, `/s/*` to the link resolver. Cheaper than several distributions,
  and the behaviour ordering is examinable.
- **Nothing is dynamic at request time.** Prerendered HTML plus a client bundle; no server
  participates in a page view.

## Where the money leaks

Everything through Phase D should sit in low single-digit pounds per month. The specific
things that would change that:

| | |
| --- | --- |
| **NAT Gateway** ~£25/mo | Phase F only. **Design the VPC NAT-free with interface endpoints from the outset** rather than retrofitting. Largest available saving and a defensible decision the exam asks about. |
| **EKS control plane** ~£60/mo | Lab only, never for this product. Same-day teardown, no exceptions. |
| **OpenSearch** ~£20/mo+ | The obvious-looking answer for browsing community tunings, and the wrong one at this scale. Prebuilt static index or Athena instead. |
| **QuickSight** varies | Per-author monthly pricing that does not stop when you stop using it. Consider a rendered document before a live dashboard. |

## Decide at fork time

**Should the cache and credential volumes under `/home/dev` be shared with
`devcontainer-aws-base`, or separated?** Open at the time of writing, and open for a reason —
it needs more AWS familiarity than existed when the roadmap was written. It is forced at step
4 of the fork.

**If it is still undecided, take separate volumes.** Isolation is the cheaper mistake to
undo: separating later means untangling credentials, sharing later is a volume rename.

If separated, rename them in the `mounts` array **and** mirror the names into
`runcontainer.ps1`'s `$homeVolumes` list, or `purge` will not find them. The
docker-in-docker volume needs no attention — the feature names it after the devcontainer id,
so a fork gets its own.

One more that catches people: **the image build context must be a git checkout**, because the
Dockerfile runs `git reset --hard` to restore symlinks. A build in a directory with no `.git`
fails.
