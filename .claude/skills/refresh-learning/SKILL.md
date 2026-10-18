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
   - Any state the syllabus claims for a step must match that step's row in the status table
     on `master`. If they differ, fix whichever is wrong in this branch; a tutor that finds the
     two disagreeing has to stop and report it.
3. **Update the manifest in `README.md`.** Every file a topic points at needs its full
   raw `master` URL in the manifest. Add new stacks and docs. Remove deleted ones.
4. **Check the links.** Every URL must point at a file that exists in the tree. For this repo,
   check the path with `git ls-files`. For the `harpguru` roadmap URLs, check the path in
   `/harpguru` after pulling. Report any that do not resolve.
5. **Keep `agent-prompt.md` consistent.** Its closing "URLs you may open" list must be the
   README manifest's URLs plus the README's own, in the same strings, because the agent's fetch
   tool may refuse a URL it has not seen written out in the owner's message. Regenerate it from
   the manifest and diff the two. The list is the fallback entry, used if the README alone does
   not work; the usual entry is the README's URL. Change the prompt beyond the list only for a
   reason, and tell the owner when a changed prompt needs repasting.
6. **Dry-run the session from the README.** The owner enters by giving the tutor only the
   README's URL, so test that route as the tutor would, knowing nothing but what each file says.
   - Open `docs/learning/README.md` and follow it. Then `agent-prompt.md` and the syllabus. Reach
     every other file only through a URL in the README manifest, mapping a `master` URL to the
     same path in the working tree. If a file you want is not in the manifest, that is a defect.
   - Run the tutor's first steps: the freshness check, then pick one *must own* topic and
     try to answer its "Be able to answer" questions from its listed sources alone. A question
     you can only answer from your own knowledge of the repo means a source is missing or too
     thin. For each concept entry the syllabus names, find its heading in `aws-concepts.md`.
   - Fix what you find: add missing files to the manifest and the prompt's URL list, correct
     headings, add the facts a topic needs.
   - Once the branch is merged, repeat against the real URLs with a fetch tool, starting
     from the README's raw URL alone. Note whether links reached only through a fetched page
     are refused as unseen, and report it. Known so far (2026-10-18, Claude mobile): a URL is
     accepted only in the turn it was written out, in the owner's message or a page fetched
     that turn. That is why the prompt and README tell the tutor to fetch everything in its
     first turn; keep that instruction, and keep the manifest small enough to fetch at once. Until it is merged, `master` serves the old content, so
     say the live check has not been done.
7. **Hand over.** Follow `CLAUDE.md`: branch `1-<slug>`, no attribution trailer, push and say
   what the branch contains. Say what the dry run found and fixed, and whether the live check
   was done. Say which topics were added or changed and how they were tiered, so the owner can
   argue with the tiering. State whether `agent-prompt.md` changed, and so whether it needs
   repasting.

## Rules

- No account IDs, portal URLs or email addresses. The repo is public.
- Do not copy the roadmap or findings into this directory; link to them.
- Write for a tutor who has not seen the repo. Each topic names its sources and what the owner
  should be able to answer, not just what exists.
- The links only work for the tutor once merged to `master`. Say so if the branch is unmerged.
