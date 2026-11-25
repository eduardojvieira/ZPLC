# Plan: the didactic standard of the course (S-13, CRS-014 to CRS-025)

**Goal:** every lesson, of programming and of the plant, is very didactic, and the lessons together serve as complete courses, as the
owner decided on 2026-11-23 (spec section 4.1 S-13; brief in the logbook, L278).
**Spec:** `spec.md` CRS-014 to CRS-025, CRS-010 (as amended), CRS-011; `course-outline.md` section 6 (approval pending).
**Owner's stops:** (2) this plan, the amendment and the pilot of three lessons; (3) modules 0 to 4 and the path "Structured Text from
zero"; (4) modules 5 to 11, then modules 12 to 19 once the plant catalogue (stop 3 of `plan-vis.md`) is approved, because the
machine pages use its images. Nothing after a stop starts without the owner's approval.
**Constraint:** the lesson format does not change. Lesson ids, scenarios and hashes of 2.0 do not change (PLT-013), no lesson is
renamed or deleted, every changed package raises its `version`, and the 2.0 starters stay as they are (CRS-010). Content is original
(P17).

## State after the pilot (2026-11-24)

| Branch | What it holds |
|---|---|
| `feat/course-step2` | The amendment (CRS-014 to CRS-025, outline section 6), the placeholder `{{ui:<catalogue key>}}` for control names, expanded when the lesson index is built and understood by the didactics check, the parity rule that lets a page pair show `images/<name>.en.png` and `images/<name>.es.png`, and the three pilot lessons in both languages: `timers-on-delay-off-delay`, `sfc-fill-mix-sequence` and `plant-belt-to-sensor`. |
| `feat/course-l7-tools` | Merged: the compiler support matrix `course-l7-support.md` (every proposed ST construct "Teach"; gaps in LD, FBD and IL) and the scripts that generate the signal table and the labelled image of a scene. |

Measured cost of the pilot: one writer session for the amendment, the placeholder and the two programming lessons, about 0.5 unit per
lesson (a reading page in two languages with one figure and one or two timing diagrams, the text rewritten, the checks run), +839/−147
lines over 36 files, most of them prose. The plant lesson took about 0.6 unit, with the machine page from the generated table and
images.

## Tasks and estimate

A unit is one bounded writer session of about 1 to 1.5 hours, with its own checks, as in `plan-vis.md`. Lesson packages are disjoint
files, so up to three writers run in parallel, one writer per package. The files every lesson regenerates (`lessonIndex.json`, the
didactics table and baseline, the docs lesson pages, the course-outline pages) are the parent's: it regenerates them after each merge,
as in step 1.

Per-lesson costs used below, from the pilot: a reading page and its text for the first lesson of an idea, 0.5 unit; for a sibling
lesson in another language that practises the same idea, 0.3 unit; an existing reading page brought to the standard (headings, quiz
YAML, Edit text, scope, placeholder), 0.2 unit; the machine page of a scene in its first lesson, 0.6 unit; a new lesson package (starter, solution, scenario with its hash, wrong-program set,
text and reading page in both languages), 1 unit.

| ID | Task | Requirements | Units |
|---|---|---|---|
| T1 | The rules marked "to add" in the didactics check: `reading-parts`, `answer`, `grows`, `scope`, `machine`, the column "Starter statements" and the test of supported constructs without an explainer. Their baseline is seeded once, with the owner's approval, and only shrinks afterwards. The reading parser refuses a quiz option it cannot read whole (see Risks). | CRS-014, CRS-016 to CRS-018, CRS-020, CRS-023 | 1.5 |
| T2 | Modules 0 to 4 to the standard: 20 lessons without a reading page (10 first lessons of an idea in ST, 10 FBD and IL siblings) and the 14 that have one. | CRS-014, CRS-015, CRS-017 to CRS-021 | 11 |
| T3 | The path "Structured Text from zero" in `course.json`, its tests and docs, and its five new lessons of modules 1 to 4: `st-if-then-else`, `timer-pulse-tp`, `counter-down-up-down`, `st-real-numbers`, `st-bits-and-words`. **Owner's stop 3** after T2 and T3. | CRS-022, CRS-023 | 5.5 |
| T4 | Modules 5 to 11 to the standard: 24 lessons without a reading page (12 ST and 6 SFC first lessons, 6 FBD and IL siblings) and the 7 that have one. | CRS-014, CRS-015, CRS-017 to CRS-021 | 12 |
| T5 | The six new lessons of modules 7 and 10: `st-user-function`, `st-arrays-for`, `st-while-repeat`, `st-structures`, `st-global-variables`, `st-strings`. | CRS-022, CRS-023 | 6 |
| T6 | Modules 12 to 19 to the standard: a machine page for each of the 21 scenes in its first lesson, with the generated image and signal table, and the other 22 plant lessons (14 of them Ladder siblings); the review's other L8 items (the palletizer's "timed jog found by trial"). Starts after the plant catalogue is approved. **Owner's stop 4.** | CRS-014, CRS-016, CRS-017 to CRS-021 | 19 |
| T7 | The two journeys of CRS-025: the first lesson and the first plant lesson followed word for word in a real Studio window until passed. | CRS-025 | 1 |
| T8 | Optional: the Ladder siblings `timer-pulse-tp-ladder` and `counter-down-up-down-ladder` for the `ladder` path. | CRS-023 | 1 |
| V | One independent verifier at each of the three stops. | CRS-014 to CRS-025 | 3 |
| — | Corrections the owner asks for at the stops (one round per stop expected). | | 3 to 6 |

Total: about 63 to 66 units, 62 to 65 without T8. With three writers in parallel, about four working days of writer time, plus the
owner's reviews at stops 3 and 4. The compiler support matrix keeps every new lesson: all of them teach Structured Text constructs it
marks "Teach". RETAIN gets a section of a reading page and no graded lesson, because a scenario has no restart event.

## 2.1.0 and 2.1.x

Recommendation: in 2.1.0, T1, T2, T3, T6 and T7, with their verifiers and corrections, about 43 units: the modules every learner starts
with, the path "Structured Text from zero" from lesson 1 to the end of module 4, and the plant course that 2.1 adds. In 2.1.x (2.1.1 and
2.1.2), T4, T5 and T8, about 21 units: modules 5 to 11 to the standard and the six new lessons of modules 7 and 10.

Why this split:
- Modules 0 to 4 are where the review found the explanation after the practice (L2) and where a new learner decides whether the course
  teaches. Modules 12 to 19 are what 2.1 is released for, and the review found that they do not present the machine (L8).
- Modules 5 to 11 keep working as they do in 2.0 meanwhile: every lesson passes, has its wrong-program set (step 1) and leads to Check.
  What they lack is the reading page and the Edit text of the standard.
- The new lessons add packages, never rename or remove one, so the path grows in 2.1.x without touching saved progress. In 2.1.0 the
  path lists 27 lessons: the 22 that exist and the five new ones of T3.
- The definition of done (spec section 7, item 9) then holds for the modules the release carries; the baseline of the didactics check
  keeps the entries of modules 5 to 11 until 2.1.x removes them.

Everything in 2.1.0 is possible: about 21 units more before the cut. A smaller 2.1.0, T1 and T6 only, is not recommended: the plant
lessons would teach better than the lessons a learner meets first.

## Risks

- **Quiz feedback is cut today.** The quiz options of the 21 existing reading pages are YAML flow mappings, and an unquoted comma ends
  a value: 99 feedback texts on 42 pages show only their first clause in Learn (for example "Yes. Rung 1 was already solved in this
  scan" on `ld-scan-cycle`, whose page goes on "so it only sees the new value one scan later"). The two pilot pages quote every value.
  T1 makes the parser refuse it; T2 and T4 quote the existing pages.
- **The compiler support matrix** is a snapshot of 2026-11-24. Its probes run with the IDE tests (`src/learn/l7Support.test.ts`), so a change that breaks a taught construct
  fails there, and a closed gap fails its gap probe, which is when the Ladder, FBD or IL lesson for it can be written (outline 6.3).
- **The machine pages** depend on the image and table scripts of the course tools and on the images of the approved plant catalogue; T6
  moves with `plan-vis.md`. The pilot found two layout problems in Learn at 1440 × 900: the labels of the machine image are about
  5 px high once the 1773 px image is fitted to the reading column, and the seven-column signal table is wider than the column, so
  its last column is cut. The table still carries every fact. The scripts' owner fixes both before T6 (larger labels or a narrower
  layout; two tables, the parts and the signals).
- **The pasted signal table can go stale.** The reading page holds the table as `signal-table.ts` wrote it, aligned by the
  formatter. `signal-table.ts --check` checks a folder of table files, not a reading page; T1's rule `machine` compares the table of
  each plant reading with the script's output (`tablesOf` in `scripts/learn/signal-table.ts`), cell by cell.
- **Shared generated files** conflict on every merge; the parent regenerates them, so a writer never edits the index, the table, the
  baseline or a generated page by hand.
- **The course-outline docs page** of modules 0 to 11 is hand-kept, and its lesson order is the order before step 1; running
  `generate_outline_sections.ts` from module 3 would reorder it but also delete its hand-written notes (modules 7 and 10). T2 fixes the
  generator or the page.
- **The contributing page** (`docs/docs/contributing/index.md`, both languages) lists the markup of a lesson text without the new
  `{{ui:<key>}}` row; it is outside the pilot's files.
- **Evidence level.** Lesson CI proves each solution and starter on the native runtime on Linux, and the screenshots of the stops are
  taken in a real Studio window under a virtual display; neither says how a learner reads the pages. CRS-025's journeys follow the text
  literally, but only a person can judge whether it teaches.
