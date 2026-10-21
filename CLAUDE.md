# harpguru-cloud

The AWS half of Harp Guru. **Read [docs/orientation.md](docs/orientation.md) before
planning anything.** It links to the roadmap and findings in `js-jslog/harpguru`, which are
the plan, and explains what this repo must never contain.

## Where work stands

The current phase's plan and status are in **[docs/plans/](docs/plans/)**, one file per
phase. On a cold start, read the status table there to see what has shipped, what is in
flight and what is waiting on the user. Update it in the same PR that changes it.

## Learning companion

**[docs/learning/README.md](docs/learning/README.md)** is the entry point for a tutor agent
on the user's phone, which the user sends its raw URL. It is the tutor's whole prompt and its
only list of sources; the syllabus beside it holds the topics. It covers what has been built,
not what is planned. The user asks for it to be refreshed periodically; use the
`refresh-learning` skill. A refresh is not part of the per-PR checklist below, but bumping the
cache stamp is, because the tutor's fetch tool caches by URL.

## Working agreements

- **Nothing important lives in agent memory.** The container is disposable and memory is
  cleared deliberately. Agreements, decisions and status go in this file, `docs/plans/`,
  `docs/aws-concepts.md` or the findings doc in `harpguru`. If something is only in
  memory, it is not recorded.
- **Branches** for the umbrella issue #1 are named `1-<slug>`.
- **No AI attribution in commits or PRs, in either repo.** No `Co-Authored-By` trailer
  and no "Generated with" line. This overrides any default the agent's tooling suggests.
- **The user opens the PRs.** Push the branch and say what it contains. There is no `gh`,
  and none will be installed.
- **The user runs `cdk diff` and `cdk deploy`.** Prepare the change, explain what the diff
  will show, and let them run it. Read-only `aws` queries are fine to run directly.
- **`docs/aws-concepts.md` is the user's study companion.** Every PR that introduces an
  AWS concept adds its entry in that same PR. Keep entries short: what it is, how it is
  used here, one sentence worth saying in an interview, and a command to see it for real.
- **Findings go to `/harpguru`**, on the branch tracking this work (currently
  `178-build-the-harp-face-widget`). They never go here. See the orientation file for the
  push rules.
- **Keep account IDs, portal URLs and email addresses out of the repo.** They are not
  secrets, but the repo is public. `aws sts get-caller-identity` recovers the account;
  addresses are supplied at deploy time.
- **Open with a table of terms.** Any response that uses an AWS acronym (OU, SCP, ARN) or
  a product name (GuardDuty, CloudTrail) begins with a very short table of those terms:
  each one expanded, with a few words on what it does, such as "SCP: Service Control
  Policy, a ceiling on what member accounts' principals may do". It covers only the terms
  in that response. The user is learning, and new ground arrives quickly. A list of terms
  that no longer need translating may be added here later, if the tables grow too long.

## Before pushing a branch

- **New AWS concept?** Add its entry to `docs/aws-concepts.md`, and run its "See it" command
  against the account first.
- **Has a step in `docs/plans/` moved?** Update the status table.
- **Changed a file listed in `docs/learning/README.md`'s sources?** Bump the `?v=` cache stamp
  on every raw URL there to today's date, so the tutor fetches the new copy rather than a
  cached old one. Then tell the user the new opening URL.
- **Did the work establish a fact worth keeping?** Commit it to the findings doc in
  `/harpguru`.
- **No attribution trailer** in any commit message.
- When handing the branch over, **name the concept entries it adds**. If it adds none, say
  why.
