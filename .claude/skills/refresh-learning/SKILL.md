---
name: refresh-learning
description: Refresh docs/learning/ so the owner's mobile tutor agent teaches from what the repo has actually built. Use when the owner asks to update, refresh or extend the learning material or syllabus.
---

# Refresh the learning companion

`docs/learning/` has two files, and nothing is said in both:

- **`README.md`** is the tutor's entry point and whole prompt. The owner sends the tutor its
  raw URL and asks it to follow the instructions there. It holds the role, how sessions run,
  the tiers, the ground rules, and **the only list of sources**, each a full raw URL.
- **`syllabus.md`** holds the topics: tier and why, "Be able to answer" questions, and
  sources named by path and heading. It has no URLs and does not restate the facts its
  sources hold.

Facts the tutor's fetch tool imposes, which the README's design depends on:

- Only `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` URLs work. GitHub's
  `blob` pages are built by JavaScript and come back empty. Raw files have no section anchors,
  so a section is named by its heading, exactly as written.
- A URL is accepted only in the turn it was seen, in the owner's message or a page fetched
  that turn (found 2026-10-18, Claude mobile). So the README tells the tutor to fetch every
  source in its first turn. Keep that instruction, and keep the sources small enough to fetch
  at once; they are about 120 KB.

Read both files before changing anything, so you keep their intent.

## Steps

1. **Find what changed.** Read the status table in `docs/plans/`. Compare it with the "As of"
   date in `docs/learning/syllabus.md`. Run `git log --since=<that date> --oneline` and read
   the new stacks, scripts and `docs/aws-concepts.md` entries. Only work on `master` belongs.
   Planned or unmerged steps stay out; the syllabus's last section lists them as not yet built.
2. **Update the syllabus.**
   - Add topics for new concepts. Set the tier honestly: **must own** only where the idea is a
     decision or a security or cost property the owner should defend unprompted, not merely
     something used. Most new topics are *should understand*.
   - Revise topics where the code or decisions changed. Check each question can be answered
     from the sources named, by reading them; do not write from memory.
   - Move anything now on `master` out of "Not yet built".
   - Update the "As of" date and what is deployed versus only merged. Any state claimed for a
     step must match its row in the status table on `master`; fix whichever is wrong.
3. **Update the README's Sources.** Every path the syllabus names must be listed, with its raw
   `master` URL and one line on what it is. Add new stacks and docs; remove deleted ones. Change
   the rest of the README only for a reason, and say so in the hand-over.
4. **Check the links and names.** Every URL must point at a file that exists: check this repo's
   paths with `git ls-files`, and the `harpguru` paths in `/harpguru` after pulling. Every
   quoted heading in the syllabus must exist in the file it names. Report any that do not.
5. **Dry-run a session from the README**, as the tutor would, knowing nothing but what each
   file says.
   - Read the README and follow it: open every source it lists, mapping each URL to the same
     path in the working tree, and nothing else. A file you want that is not listed is a defect.
   - Run the freshness check. Then pick one *must own* topic and answer its questions from its
     named sources alone. A question you can answer only from your own knowledge of the repo
     means a source is missing or too thin.
   - Fix what you find.
   - Once merged, repeat against the real URLs with a fetch tool, starting from the README's raw
     URL alone. Until then `master` serves the old content, so say the live check is not done.
6. **Hand over.** Follow `CLAUDE.md`: branch `1-<slug>`, no attribution trailer, push and say
   what the branch contains. Say what the dry run found and fixed, and whether the live check
   was done. Say which topics were added or changed and how they were tiered, so the owner can
   argue with the tiering.

## Rules

- No account IDs, portal URLs or email addresses. The repo is public.
- Do not copy the roadmap or findings into this directory; list them as sources.
- Write for a tutor who has not seen the repo.
- The URLs only work for the tutor once merged to `master`. Say so if the branch is unmerged.
