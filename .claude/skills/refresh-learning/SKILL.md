---
name: refresh-learning
description: Refresh docs/learning/ so the owner's mobile tutor agent teaches from what the repo has actually built. Use when the owner asks to update, refresh or extend the learning material or syllabus.
---

# Refresh the learning companion

`docs/learning/` is read by an agent that can open only
`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` URLs, which return the file
as plain text. GitHub's `blob` pages are built by JavaScript and come back empty to it, so never
link to one. Raw files have no section anchors, so link text naming a concept entry must match
its heading exactly. The agent cannot browse or list directories. Everything it needs must be
reachable from `docs/learning/README.md`. Read that file and `docs/learning/agent-prompt.md`
before changing anything, so you keep their intent.

## Steps

1. **Find what changed.** Read the status table in `docs/plans/`. Compare it with the "As of"
   date in `docs/learning/syllabus.md`. Run `git log --since=<that date> --oneline` and read
   the new stacks, scripts and `docs/aws-concepts.md` entries. Only work that has **shipped**
   belongs. Planned steps stay out; the syllabus's last section lists them as not yet built.
2. **Update the syllabus.**
   - Add topics for new concepts. Set the tier honestly: **must own** only where the idea is a
     decision or a security or cost property the owner should defend unprompted, not merely
     something used. Most new topics are *should understand*.
   - Revise existing topics where the code or decisions changed. Check a claim against the
     source file before writing it; do not restate from memory.
   - Move anything that now exists out of "Not yet built".
   - Update the "As of" date and whether each step is deployed or only merged.
3. **Update the manifest in `README.md`.** Every file a topic points at needs its full
   raw `master` URL in the manifest. Add new stacks and docs. Remove deleted ones.
4. **Check the links.** Every URL must point at a file that exists in the tree. For this repo,
   check the path with `git ls-files`. For the `harpguru` roadmap URLs, check the path in
   `/harpguru` after pulling. Report any that do not resolve.
5. **Keep `agent-prompt.md` consistent.** Its closing "URLs you may open" list must be the
   README manifest's URLs plus the README's own, in the same strings, because the agent's fetch
   tool may refuse a URL it has not seen written out in the owner's message. Regenerate it from
   the manifest and diff the two. Beyond that list, change the prompt only for a reason, since
   the owner has it pasted elsewhere. Whenever the list changes, the owner must repaste it.
6. **Hand over.** Follow `CLAUDE.md`: branch `1-<slug>`, no attribution trailer, push and say
   what the branch contains. Say which topics were added or changed and how they were tiered,
   so the owner can argue with the tiering. State whether `agent-prompt.md` changed, and so whether it needs repasting.

## Rules

- No account IDs, portal URLs or email addresses. The repo is public.
- Do not copy the roadmap or findings into this directory; link to them.
- Write for a tutor who has not seen the repo. Each topic names its sources and what the owner
  should be able to answer, not just what exists.
- The links only work for the tutor once merged to `master`. Say so if the branch is unmerged.
