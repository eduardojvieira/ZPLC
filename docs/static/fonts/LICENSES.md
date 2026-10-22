# Fonts of the site

The site serves its two typefaces from this folder and loads none from another host. They are the same files the ZPLC
application bundles (`packages/zplc-ide/src/assets/fonts/`, described in its `FONTS.md`), so the site and the screenshots of the
application show the same letters. Both families are licensed under the SIL Open Font License 1.1; the full text of each
licence is next to the files.

| File                                | Family                                               | Use on the site                       | Licence                 | Copyright                                                                      |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `Inter-Variable-latin.woff2`        | Inter (variable: `opsz` 14 to 32, `wght` 100 to 900) | Text, headings, navigation            | `Inter-OFL.txt`         | The Inter Project Authors, https://github.com/rsms/inter                       |
| `JetBrainsMono-Regular-latin.woff2` | JetBrains Mono, regular (400)                        | Code, identifiers, file names, values | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors, https://github.com/JetBrains/JetBrainsMono |
| `JetBrainsMono-Bold-latin.woff2`    | JetBrains Mono, bold (700)                           | Emphasis in code                      | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors                                             |

The files are Latin subsets in WOFF2: Basic Latin, Latin-1 Supplement (the accented letters, `ñ`, `¿` and `¡` of Spanish), Latin
Extended-A, general punctuation, arrows, geometric shapes and the minus sign. The subsetting command is in
`packages/zplc-ide/src/assets/fonts/FONTS.md`. When the application changes a file, copy it here with its licence.
