---
slug: /development/ide-internals
title: IDE internals
sidebar_label: IDE internals
description: 'For contributors to the ZPLC application: how to add a translated text and what the i18n guard enforces, what loads at start and how the start-up and render budgets are checked, and what is drawn again when a watched value changes.'
---

# IDE internals

This page is for a contributor who changes the ZPLC application (`packages/zplc-ide`). It covers three things the user guides leave out: how to add a text in both languages, what the application loads before the first screen, and what the window draws again when a watched value changes. Each section names the check that holds the rule, so you can run it before you push.

All the evidence here is host evidence: unit tests, a production build and static checks. None of it measures a packaged installer or a user's machine.

## Add or change a text

Every text the interface shows is in two catalogs, English and Spanish, and a component never writes a sentence itself.

### Where the texts live

- `packages/zplc-ide/src/i18n/en.ts` holds the base English texts and merges the catalog modules. `es.ts` does the same for Spanish and is typed against the English keys.
- The texts of one screen live in a module of their own, `packages/zplc-ide/src/i18n/catalog/<screen>.ts` (for example `notices.ts`, `toolbarMsg.ts`, `console.ts`). A module exports both languages side by side, and `en.ts` and `es.ts` spread them.
- A key is a dotted path from the surface to the text, such as `welcome.open.title`. A `{name}` marks a value the caller supplies. A `.one` and `.other` pair is a plural.
- The language setting is `auto`, `en` or `es` (`src/i18n/locale.ts`). `auto` takes the primary subtag of the system language, so `es-AR` is `es`, and falls back to English.

### Steps

1. Add the key and its English text to the module of the screen, in the `...En` object. If the screen has no module yet, create one and spread it in both `en.ts` and `es.ts`.
2. Add the same key, in Spanish, to the `...Es` object of the same module. It is declared as `Record<keyof typeof xxxEn, string>`, so a missing or an extra key is a TypeScript error, and a different `{name}` marker is a failure of the guard.
3. Use the text:
   - in a component, `const { t, tn } = useT()`, then `t('welcome.open.title')`, or `tn('notices.tests.scenarios', count)` for a plural;
   - outside a component (a menu, a dialog, an error), import `t` or `tn` from `src/i18n`.

```ts
// packages/zplc-ide/src/i18n/catalog/notices.ts
export const noticesEn = {
  'notices.tests.scenarios.one': '{count} scenario',
  'notices.tests.scenarios.other': '{count} scenarios',
};
export const noticesEs: Record<keyof typeof noticesEn, string> = {
  'notices.tests.scenarios.one': '{count} escenario',
  'notices.tests.scenarios.other': '{count} escenarios',
};
```

If a key is missing from a catalog at run time, ZPLC shows the English text, or the key itself when no catalog has it, and writes one warning to the console. The product name is written once for the renderer (`src/productName.ts`) and once for the main process (`electron/productName.ts`); texts interpolate it, and `electron/productName.test.ts` proves the two agree with the title of `index.html`.

### What the i18n guard enforces

`bun tools/ci/i18n-guard.ts` runs as part of `bun run lint:ide`. With `--list` it prints every hard-coded string with its line, and with `--write` it lowers the counts that shrank.

| Rule                                               | What fails                                                                                                                                                                                                                                                                                                                                                                                                                   | Requirement |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `hard-coded-text`, `hard-coded-attribute`          | JSX text with letters, or a string shown as a JSX child, or a string in `aria-label`, `placeholder`, `alt`, `label`, `tooltip`, `title` or `description` of a component. Text inside `<code>`, `<kbd>`, `<pre>`, `<samp>` and `<var>` is technical vocabulary and does not count                                                                                                                                             | UX-029      |
| `hard-coded-message`                               | A sentence in a plain `.ts` module that shows text to the person (a presentation, a flow, a keyboard): in a `say`, `title`, `label`, `detail`, `message`, `description`, `hint`, `heading`, `summary`, `placeholder`, `tooltip` or `ariaLabel` property, in the first argument of `announce()`, or in what a function or table named `...Label`, `...Message`, `...Text`, `...Title`, `...Hint` and similar returns or holds | UX-029      |
| `missing-key`, `extra-key`, `placeholder-mismatch` | The two catalogs differ in their keys or in their `{placeholders}`                                                                                                                                                                                                                                                                                                                                                           | UX-029      |
| `sentence-case`                                    | A capital letter in the middle of a sentence that is not an acronym, a code token, a quoted label or a name on the `PROPER_NOUNS` list                                                                                                                                                                                                                                                                                       | UX-031      |
| `exclamation`                                      | An exclamation mark, `!` or `¡`                                                                                                                                                                                                                                                                                                                                                                                              | UX-031      |
| `internal-term`                                    | A term of the engineering team: `candidate`, `link zplc.json`, `stopgap` and their Spanish forms                                                                                                                                                                                                                                                                                                                             | UX-031      |
| `voseo`                                            | Rioplatense voseo in the Spanish text (decision D-10, neutral register)                                                                                                                                                                                                                                                                                                                                                      | UX-030      |

The tests, the i18n module itself, the component gallery, the MCP server, the command line, the compiler and the language service are out of the guard's reach: the last four speak to programs and keep the compiler's own English.

The catalogs have no list of exceptions; they start clean and stay clean. The hard-coded-text rules have none left either. The only exceptions are the 26 entries for `hard-coded-message` in `tools/ci/i18n-offenders.json`, each with a file, a count and a reason. That list can only shrink: a count above its entry, or an unlisted file, fails; a count below must be lowered (`--write` does it); an entry that reached zero must be removed.

The checks are `tools/ci/i18n-guard.test.ts` for the guard, `packages/zplc-ide/src/i18n/i18n.test.tsx` for the catalogs and `packages/zplc-ide/src/utils/appSettings.test.ts` for the language setting (UX-029, UX-030, UX-031).

## What loads at start

The first screen is Welcome. It must not pay for the editors, so the build splits them into chunks that load when a project opens. `packages/zplc-ide/scripts/welcomeBundle.test.ts` builds the application with the repository's Vite configuration into a temporary folder, reads the Vite manifest and the source map of each chunk, and holds these rules (IDE-015):

- the chunks the entry page loads at start contain the Welcome screen and none of `monaco-editor`, `@xyflow`, the code editor, the Ladder, FBD and SFC editors, or the project settings;
- the code editor, the project settings and the Ladder editor each have a chunk of their own that is not loaded at start;
- the start chunks together are smaller than the chunks that load on use;
- the packaged application holds no source map and still holds the page and its scripts;
- only the editor core and the Structured Text language of Monaco are bundled, with the editor worker and no language worker.

The same build is checked for the network (LRN-030): the content security policy of the installed application and the main process fetch nothing from another host at start, in Learn or in the simulation, and the update check runs only when turned on.

### Measured baseline

The test sets a rule, not a number. These sizes are from a production build of this tree on a Linux development machine on 2026-11-06, with source maps off, so treat them as a baseline to compare against and not as a limit:

| Measure                                             | Value                       |
| --------------------------------------------------- | --------------------------- |
| JavaScript loaded at start (entry and React vendor) | about 3,800 KB in 2 chunks  |
| JavaScript in the whole build                       | about 8,270 KB in 28 chunks |
| CSS in the whole build                              | about 240 KB                |
| The Monaco chunk, loaded when a project opens       | about 3,600 KB              |

To measure again, run `bun test packages/zplc-ide/scripts/welcomeBundle.test.ts` for the rules, and `vite build` in `packages/zplc-ide` with `build.manifest` on to read the sizes from `dist/.vite/manifest.json`.

### Module size

A hand-written module of `src/`, `electron/` or `shared/` has at most 1600 lines (IDE-014, accepted by the owner on 2026-10-22). `bun tools/ci/ide-structure.ts` checks it, and also the layering (a module of `src/store/` does not import from `src/components/`), import cycles, and whole-store subscriptions. No module is above the limit today, so `tools/ci/module-size-offenders.json` is empty.

## What is drawn again when a value changes

A watched variable is read from the runtime about ten times a second, and a person may be typing in a long file at the same time. If every region of the window listened to the whole store, each reading would draw them all again. So each region subscribes to the fields it shows, and a reading that did not change a value publishes nothing.

### The rules

- A component or hook outside `src/store/` must not subscribe to the whole store (`useIDEStore()`, or a selector that returns the state or its `debug` slice). `bun tools/ci/ide-structure.ts` fails on it (IDE-013).
- The selection of each region is a named selector in `packages/zplc-ide/src/store/regionSubscriptions.ts`: `editorArea`, `openFiles`, `activeFileInfo`, `toolbar`, `console`, `sidebar`, `welcome`, `theme`, `projectSettings` and `fileTree`. Use it with `useShallow`, so the region draws again only when one of the named fields changes.
- A value that shows watched variables selects only those paths with `selectLiveValues(paths)` (`src/hooks/useDebugValue.ts`), so another variable changing does not draw it again.
- `withLiveValues` (`src/store/liveValues.ts`) returns the same state when no reading differs from the stored value, and the store does not publish a state that is the same object.

### What the test counts

`packages/zplc-ide/src/store/regionSubscriptions.test.ts` has no DOM. It runs the real selectors against the real store and counts how often each selection changes, which is what decides a render. With 200 watched values and 2,000 lines of source it holds:

| Event                                                                   | Draws again                                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100 readings of the 200 values (about ten seconds)                      | No region that shows none of them: all ten counts are 0                                                                                                                |
| A region that shows five of the values, ten of 100 readings change them | That region 10 times, and a region that shows all 200 values 100 times                                                                                                 |
| 100 readings that return the values they already had                    | Nothing: no publication, and the state is the same object                                                                                                              |
| 100 keystrokes in the file                                              | The tab bar and editor (`openFiles`) 100 times, the Console at least once, and the toolbar, sidebar, Welcome, theme, project settings, file tree and file info 0 times |
| 100 readings with a keystroke on every second one                       | `openFiles` and the Console 50 times each, and the regions above 0 times                                                                                               |

Evidence level: host. No render was timed in a browser, and no frame rate was measured.

## Run the checks

```bash
bun run lint:ide
bun test packages/zplc-ide/src/store/regionSubscriptions.test.ts
bun test tools/ci/i18n-guard.test.ts packages/zplc-ide/src/i18n/i18n.test.tsx
bun test packages/zplc-ide/scripts/welcomeBundle.test.ts
```

`bun run lint:ide` runs ESLint, the structure check, the design-token check, the UI-kit check and the i18n guard. The Welcome bundle test builds the application, so it takes longer than the others.

## Probe a packaged build

The security probes of the [application page](../ide/index.md#security-properties) run on the development host with `bun run test:journeys`. To run all of them against a packaged application on Linux, build an unpacked package and point the journeys at it:

```bash
bun run --cwd packages/zplc-ide build:assets
bun run --cwd packages/zplc-ide build
bun run --cwd packages/zplc-ide electron:compile
(cd packages/zplc-ide && bunx electron-builder --linux --dir)
ZPLC_PACKAGED_DIST="$PWD/packages/zplc-ide/dist-electron" bun run test:journeys
```

The packaged archive has no folder dialog, so the probes reach the project through a recent-projects list written to the user-data directory first. They cover Linux only. The packaged application on macOS and Windows is not probed, although the requirement asks for all three.
