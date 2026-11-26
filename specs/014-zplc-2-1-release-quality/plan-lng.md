# Plan: every compiler function in FBD and Ladder (LNG-029, LNG-030)

**Decision**: S-23, D-37 (owner, 2026-11-26). **Base**: `7a713277`. **Stop**: point 5 of the owner (guards below); anything else is no stop. The independent verifier reads this page before any unit starts.

## Measured at the base (host, by running the product's functions)
| What | Count | Where |
|---|---|---|
| Functions the compiler registers, `getAllFnNames()` | 297: 240 conversions, 57 named | `zplc-compiler/src/compiler/stdlib/index.ts` |
| FBD palette blocks / registered functions FBD places | 64 (60 + 4 value blocks) / 8: `MAX MIN LIMIT SEL NAND NOR ABS MOD` | `IDE/src/editors/fbd/palette.ts`, `fbdPlacesBlock` |
| Ladder boxes `LD_FUNCTIONS` / of them registered functions | 15 / 4: `MOD LIMIT MIN MAX` (the other 11 are operators) | `IDE/src/models/ldSupport.ts:43` |
| `FUNCTION_DOCS` (57 named: params, returns, `variadic`, category, en/es, example), `FUNCTION_CATEGORIES` (en/es) | not exported | `stdlib/reference.ts:68,117` |
| `CONVERSION_TYPES` (16 types), `conversionName`, `conversionResultType` | not exported | `stdlib/conversions.ts:66` |
| `VOID` | `WATCHDOG_RESET()`; without parameters also `UPTIME`, `CYCLE_TIME` (DINT) | |
| Variadic | `MUX(K:INT, IN0:ANY, IN1:ANY, ...) : ANY` (registry: `variadic: true`, `argCount: 2`) | `stdlib/functions.ts:335` |
| STRING | 14: `LEN CONCAT LEFT RIGHT MID FIND INSERT DELETE REPLACE STRCMP COPY CLEAR EQ_STRING NE_STRING`; `COPY` writes `DST`, `CLEAR` writes `S` | |
| Generic types among the new | `ANY`: `MUX`; `ANY_NUM`: `NEG`; `ANY_BIT`: `SHL`, `SHR` (`ROL`, `ROR` are DWORD) | |
| Existing diagrams (FBD/LD files) | 167: lessons 0/28, projects 19/70, `conformance/lng` 16/25, `tools/hil` 4/5 | |
| Formats module | FBD still lists the whole catalogue (`STANDARD_BLOCKS = getBlockCategories()`) on `feat/aix-u1-formats` and `feat/aix-u2-diagnostics` (`91a5db7a`): the F-02 fix is on no branch yet. Ladder lists `Object.keys(LD_FUNCTIONS)` | `IDE/src/formats/{fbd,ld}.ts` |

## The single mechanism
`IDE/src/catalog/stdFunctions.ts` (new) turns the compiler's table into one record per registered name: input pins `[name, type]`, `returns`, `variadic`, category, en/es text. Named functions read `FUNCTION_DOCS`; a conversion is `IN : FROM`, returns `TO`, from `CONVERSION_TYPES`. The one fact the table lacks is kept beside it: `COPY.DST` and `CLEAR.S` are written by the call, with a test that pins it to the reference text. A test asserts that the records cover exactly `getAllFnNames()`.
- **FBD**: `classify` gets a last branch `isFn(type) -> 'stdfunction'`, after every current branch, so the 8 keep their code path and their ST. `getDefaultPorts` reads the record (no `OUT` for VOID). Emission: positional arguments in table order, `OUT := NAME(a, b);`; a concrete pin renders its source to its type; the generic pins of one call go through the existing `unify`, and a generic return takes that type (as `MAX`/`MIN`). An unconsumed result is still a call, `NAME(a, b);`, as for project functions today; VOID is always that statement. An unwired pin, a type clash, and a written pin (`COPY.DST`) not wired from a variable block are errors naming the block and the pin.
- **Ladder**: `LD_FUNCTIONS` = the 15 entries as they are, plus one entry from the record for each of the 293 other names; new kind `function`: `IF <power> THEN <output> := NAME(<operands>); END_IF;`, ENO = power (LNG-028). VOID has no output and emits `IF <power> THEN WATCHDOG_RESET(); END_IF;`. The Structured Text compiler types the call, so `ANY*` follows the operands, and its errors are mapped to the rung and cell. `EQ_STRING`/`NE_STRING` store a BOOL like any other function; the 6 comparison boxes stay the only ones that pass power on a result.
- **MUX inputs**: the document already stores the input ports of each FBD block. "Add input" and "Remove input" (context menu and keyboard command list of the block) append or drop `IN<n>`, never below `IN0`, `IN1`; the transpiler reads the ports of the document. A Ladder box gets the same two commands in its slot editor; `operands` grows, and validation accepts at least 3 operands (`K`, `IN0`, `IN1`) for a variadic record and exactly the pin count otherwise.
- **STRING operands in Ladder**: a declared STRING variable is accepted already. `OPERAND_LITERAL` (`transpiler/ldToSTValidation.ts:328`) gains the IEC literal `'...'` with `$` escapes, passed verbatim. A written operand (`COPY` `DST`, `CLEAR` `S`) must be a declared variable; a literal there is an error naming the rung and cell.

## Units (sequential: 1, 2, then 3 and 4 in parallel)
| Unit | Writer | Allowed edit surfaces | RED first | Depends |
|---|---|---|---|---|
| U-LNG-1 FBD core | opus | `packages/zplc-compiler/src/compiler/index.ts` (export lines only); `packages/zplc-ide/src/catalog/stdFunctions.ts`; `packages/zplc-ide/src/transpiler/fbdToST.ts`; `packages/zplc-ide/src/models/fbd.ts`; `packages/zplc-ide/src/models/pinTypes.ts`; `packages/zplc-ide/src/editors/fbd/nodes/FunctionBlockNode.tsx`; `packages/zplc-ide/src/editors/fbd/keyboard.ts`; new tests and fixtures under `packages/zplc-ide/src/transpiler/` | 1) the golden of the ST of the 167 existing files, recorded on unchanged code, green; 2) 297 FBD compile cases, red for 289; 3) MUX add/remove; COPY errors | none |
| U-LNG-2 Ladder core | opus | `packages/zplc-ide/src/models/ldSupport.ts`; `packages/zplc-ide/src/transpiler/ldToST.ts`; `packages/zplc-ide/src/transpiler/ldToSTValidation.ts`; `packages/zplc-ide/src/editors/ld/ldFunctions.ts`; new tests under `packages/zplc-ide/src/transpiler/` | 297 rung compile cases, red for 293; a STRING literal operand; MUX operands; VOID; errors at rung and cell | U-LNG-1 (record, golden) |
| U-LNG-3 Palette | sonnet | `packages/zplc-ide/src/catalog/blockCatalog.ts`; `packages/zplc-ide/src/editors/fbd/palette.ts`; `packages/zplc-ide/src/editors/fbd/FBDToolbox.tsx`; `packages/zplc-ide/src/editors/ld/LDToolbox.tsx`; `packages/zplc-ide/src/i18n/en.ts`; `packages/zplc-ide/src/i18n/es.ts`; their tests | one "Conversions" group of 240 ordered by source type (`CONVERSION_TYPES` order), in both palettes; search by name finds `INT_TO_REAL`; group names in en/es; the description of each entry from `FUNCTION_DOCS` en/es (a conversion: one en/es message); captures of both palettes in en and es left in `.cache/claude-ux-review/lng-palette/` (outside the repository) | U-LNG-1, U-LNG-2 |
| U-LNG-4 Docs | sonnet | `docs/docs/languages/fbd.md`, `docs/docs/languages/ld.md` and their Spanish pages under `docs/i18n/es/docusaurus-plugin-content-docs/current/languages/`; `tools/docs/generate_function_reference.ts` and the two generated `reference/functions.md`; `packages/zplc-ide/src/formats/fbd.ts`, `ld.ts`; `CHANGELOG.md` | fbd.md 31 and 49 and ld.md 32 no longer send to ST; the generated pages say each function is callable from FBD and Ladder; the formats test lists exactly `fbdPaletteBlocks()` and `LD_FUNCTIONS` | U-LNG-1..3; the formats module needs AIX-U1/U2 merged with the F-02 fix |

## Guards of point 5, as tests
- **Byte-for-byte ST**: U-LNG-1's first commit records, on unchanged code, the ST of every `.fbd.json` and every rung of every `.ld.json` in `lessons/`, `projects/`, `conformance/lng` and `tools/hil` (sha256 per file plus the text); the test compares after every later commit.
- **Trace hashes**: `bun scripts/learn/sceneLessonTimings.ts --out base.json` at the base, `--compare base.json` at the end of each core unit; any difference fails.
- **No codegen or C change**: the verifier checks `git diff --stat 7a713277 -- packages/zplc-compiler/src firmware` shows only the export lines of `compiler/index.ts`.
- **LNG-002, LNG-003**: one case per error kind (unwired pin, clash, written pin from a temporary, wrong operand count) asserts the message names the block, or the rung and cell, and that no ST is produced in its place.

## Generated tests (point 6)
- **Compile**: 297 diagrams and 297 rungs from the record, each built through `compileMultiTaskProject` with zero errors (594 cases).
- **Native differential** (needs `ZPLC_NATIVE_SIM_BIN`, as the existing native tests): per function one project with the example's `VAR` block as globals, and three programs in one task: ST `LngSt := NAME(ops)`, the FBD diagram and the Ladder rung (powered) storing `LngFbd` and `LngLd`, then ST `LngSameF := LngFbd = LngSt` (`EQ_STRING` for STRING). After the example's scans both flags must be TRUE; the same scan gives `UPTIME` and `CYCLE_TIME` one value. The operands are the arguments of the first call of `NAME` in `FUNCTION_DOCS[NAME].example.source`; for a conversion, the source value of `conversionExample(FROM)` (`tools/docs/generate_function_reference.ts:141`), which the docs job already runs. `WATCHDOG_RESET` is run for its scans without a fault.

## Risks
- STRING temporaries of FBD are declared without a length: a long `CONCAT` could truncate where an ST variable would not. The differential with the reference operands shows it; the fix is in the transpiler.
- The cost: 297 native projects. One forecast before the first run; batched per category if it is slow.
- The FBD palette gains 289 entries and the Ladder one 293; search and the grouped conversions keep it usable, and the reviewer judges the captures.
- **Owner stop (point 5)**: reading shows no function that needs a codegen change, since ST already calls all 297 with these signatures. If a compile or differential case fails only because of codegen, the run stops and asks the owner, naming the function. Nothing is open today.
