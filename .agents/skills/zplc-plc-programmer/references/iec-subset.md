# Language workflow

ST is the central textual frontend. IL, LD, FBD, and SFC use their own source
models and converge through generated ST in
`packages/zplc-ide/src/compiler/index.ts` and
`packages/zplc-ide/src/compiler/transpilers/`. Preserve the original visual or
IL source; generated ST is compiler input, not a license to claim arbitrary
round-trip conversion or complete IEC 61131-3 coverage.

Read `docs/docs/languages/index.md` for the evidence boundary and the generated
language references (`docs/docs/reference/language-st.md` and the pages of the other
languages) for what works, element by element, from the executed conformance cases;
the same pages list what does not. Compile after every semantic edit. `VAR RETAIN`
and `VAR_GLOBAL RETAIN` compile in Structured Text; the IL parser rejects a `RETAIN`
declaration explicitly.

`compileMultiTaskProject` enforces task/program cardinality before resolving
or transpiling sources. Do not work around compiler diagnostics by editing
generated artifacts.
