# Learning companion — entry point

This directory exists so a conversational agent, with no access to the repo beyond reading
individual GitHub pages, can teach the owner what this project should have taught them.

**If you are that agent:** in this same turn, before you reply, open
[agent-prompt.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/learning/agent-prompt.md)
and **every URL in the manifest below**. Your fetch tool accepts a link only in the turn it was
seen, so a link from this page will be refused in a later turn. The prompt tells you how to run
a session; then read the syllabus, and the sources a topic points at before you discuss it.

## How to read this repo

Every link here is a **raw** URL, of the form
`https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/<path>`. It returns the file
itself as plain text. Do not use the `github.com/.../blob/...` page for the same file: that page
is built by JavaScript, and without it you get an empty page. You cannot list directories or
search, so every file you may need is listed in the manifest below with its full URL. If a file
you need is not listed, say so; do not guess a URL.

**If a fetch is refused** as a URL that has not been seen, copy the URL exactly as written here,
with no edits and no `#section`, and ask the owner to paste it into the chat. That makes it seen
for that turn. Ask for that before asking for the file's content, and note it under "Things to
fix".

Raw files have no links to sections. When a topic names an entry in `aws-concepts.md`, such as
"Budgets", find the heading with that name in the file.

## Manifest

### Learning material (this directory)

| File | What it is |
| --- | --- |
| [agent-prompt.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/learning/agent-prompt.md) | How to run a session: role, tiers, flow, what to report |
| [syllabus.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/learning/syllabus.md) | The topics, each tiered by how much the owner must own it, with sources |

### Where things stand

| File | What it is |
| --- | --- |
| [docs/plans/phase-a.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/plans/phase-a.md) | The Phase A plan, its **status table** (what has shipped, what is deployed) and its dated decisions |
| [docs/orientation.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/orientation.md) | What this repo is for, what it must never contain, the locked decisions |
| [CLAUDE.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/CLAUDE.md) | The working agreements between the owner and their coding agent |

### Concepts and conventions

| File | What it is |
| --- | --- |
| [docs/aws-concepts.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/aws-concepts.md) | The owner's study companion: one entry per AWS concept (what, here, say it, see it) |
| [docs/aws-conventions.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/docs/aws-conventions.md) | Credentials, cost control, the CDK-versus-Terraform decision |

### The infrastructure code (`infra/`)

| File | What it is |
| --- | --- |
| [infra/README.md](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/README.md) | How the CDK app is laid out and run |
| [infra/bin/harpguru.ts](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/bin/harpguru.ts) | The app: creates the stacks, applies tags |
| [infra/lib/config.ts](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/lib/config.ts) | Regions, deploy-time values, the management account environment |
| [infra/lib/tags.ts](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/lib/tags.ts) | The tags every resource carries |
| [infra/lib/budget-stack.ts](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/lib/budget-stack.ts) | `HarpguruBudget`: the $10 monthly budget, the only stack deployed so far |
| [infra/test/budget-stack.test.ts](https://raw.githubusercontent.com/js-jslog/harpguru-cloud/master/infra/test/budget-stack.test.ts) | Example of how the stacks are tested |

### The plan this repo works to (a different repository)

| File | What it is |
| --- | --- |
| [roadmap.md](https://raw.githubusercontent.com/js-jslog/harpguru/master/roadmap-planning/roadmap.md) | The decisions, sequence and scope. Its decisions section matters more than its phase list |
| [aws-pathway-findings.md](https://raw.githubusercontent.com/js-jslog/harpguru/master/roadmap-planning/aws-pathway-findings.md) | Verified facts, vocabulary, the account state |

## Scope and freshness

The material covers **only what has been built** in this repo. Later phases are deliberately
absent; do not teach from the roadmap about things that do not exist yet, except to say where
a concept is heading.

The owner periodically asks for this directory to be refreshed. The "As of" line at the top of
the syllabus says when it last was. If the status table in `phase-a.md` shows steps shipped
after that date, tell the owner the syllabus is stale before you rely on it.
