# harpguru-cloud

The AWS half of Harp Guru. **Read [docs/orientation.md](docs/orientation.md) before
planning anything.** It links to the roadmap and findings in `js-jslog/harpguru`, which are
the plan, and explains what this repo must never contain.

## Where work stands

The current phase's plan and status are in **[docs/plans/](docs/plans/)**, one file per
phase. On a cold start, read the status table there to see what has shipped, what is in
flight and what is waiting on the user. Update it in the same PR that changes it.

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
