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
  source in its first turn, before it writes anything. A tutor on 2026-10-19 still replied
  first, asking which topic to start on, so the instruction and the list now open the README,
  ahead of everything else. Keep them there, keep the count in the heading ("all N sources")
  equal to the list's length, and keep the first step of "How a session runs" as the fetch.
  Keep the sources small enough to fetch at once; they are about 140 KB.

Facts about the sources:

- **The `harpguru` sources are read from the findings branch, not `master`.** Findings are
  committed to the branch `CLAUDE.md` names (currently `178-build-the-harp-face-widget`), so
  that branch is ahead of `master`. Use that branch in the two `harpguru` URLs, and change it
  when `CLAUDE.md` does. When the branch is merged or deleted those URLs 404, so check on every
  refresh that the branch still exists on `origin`.
- **Every other source is written for the owner or the coding agent**, and contains
  instructions and links that are not for the tutor. The README tells the tutor to read their
  content only. Keep that, rather than editing those files for the tutor's sake.
- **Sources are listed most important first**, so a tutor whose tool limits fetches per turn
  still gets what matters.

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
3. **Update the README's source list.** It is the only place the tutor gets URLs from, so it
   must match the syllabus exactly: no more, no less.
   - **Add** every path the syllabus names that is missing, with its full raw URL (on `master`,
     or on the findings branch for `harpguru` files) and one line on what it is. Place it by
     importance: sources for *must own* topics above those only cited by lower tiers.
   - **Remove** every entry the syllabus no longer names, not only files that were deleted.
     The list is fetched in full every session, so an unused entry costs every session.
   - **Update** the count in the opening heading to the list's new length, and the size figure
     if the total has moved by more than about 10 KB.
   - Change the rest of the README only for a reason, and say so in the hand-over.
4. **Check the links and names.** Every URL must point at a file that exists: check this repo's
   paths with `git ls-files`, and the `harpguru` paths on the findings branch in `/harpguru`
   after fetching. Every quoted name in the syllabus must be a heading in the file it names; a
   reference to something that is not a heading says where it sits, such as "Steps" (item 2).
   Check that each named section actually answers the questions that cite it. Report any that
   do not resolve.
5. **Dry-run a session from the README, with a fresh agent.** You know what the files mean,
   so your own reading hides their gaps; the first fresh dry run, on 2026-10-18, found a cited
   section that did not exist on the fetched branch, a stale concept entry and five bad
   references, all missed by the author. Commit the branch first, then spawn an agent with no
   context of this work and have it:
   - Role-play the tutor from the owner's one-line message ("Please read <README raw URL> and
     follow its instructions"), with each URL mapped to `git show <branch>:<path>`, or to the
     named branch in `/harpguru` after a fetch, and any other URL counted as a failed fetch.
   - Run the first turn and the freshness check, show the syllabus, then answer every question
     of at least two *must own* topics from their named sources alone, citing file and heading,
     and saying plainly where a source does not answer.
   - Report, ranked by harm: instructions that are ambiguous or impossible; facts that
     contradict each other or the status table, including in sources the syllabus only cites;
     names that do not resolve; and links in sources that would tempt a tutor to fetch
     something that fails.
   Verify its main claims before acting on them. Fix what is wrong here; a stale statement in a
   `harpguru` doc is fixed at source there, following the orientation file's push rules. Then
   send the same agent the fixed branch and ask what is fixed, what is new, and whether every
   question is now answerable.
   - Once merged, a live check against the real URLs, starting from the README's raw URL alone,
     is the final test. Until then `master` serves the old content, so say it is not done.
6. **Hand over.** Follow `CLAUDE.md`: branch `1-<slug>`, no attribution trailer, push and say
   what the branch contains. Say what the dry run found and fixed, what it left and why, and
   whether the live check was done. Say which topics were added or changed and how they were tiered, so the owner can
   argue with the tiering.

## Rules

- No account IDs, portal URLs or email addresses. The repo is public.
- Do not copy the roadmap or findings into this directory; list them as sources.
- Write for a tutor who has not seen the repo.
- The URLs only work for the tutor once merged to `master`. Say so if the branch is unmerged.
