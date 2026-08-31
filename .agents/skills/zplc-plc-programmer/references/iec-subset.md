# Language workflow

ST is the central textual frontend. IL, LD, FBD, and SFC use their own source
models and converge through generated ST in
`packages/zplc-ide/src/compiler/index.ts` and
`packages/zplc-ide/src/compiler/transpilers/`. Preserve the original visual or
IL source; generated ST is compiler input, not a license to claim arbitrary
round-trip conversion or complete IEC 61131-3 coverage.

Read `docs/docs/languages/index.md` for the evidence boundary and
`docs/docs/languages/st.md` for supported ST constructs. Compile
after every semantic edit. Source-level `VAR RETAIN` and `VAR_GLOBAL RETAIN`
are unsupported; the IL parser rejects `RETAIN` explicitly.

`compileMultiTaskProject` enforces task/program cardinality before resolving
or transpiling sources. Do not work around compiler diagnostics by editing
generated artifacts.
