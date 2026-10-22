# Fonts of the site

The site serves its two typefaces from this folder and loads none from another host. They are the same files the ZPLC
application bundles (`packages/zplc-ide/src/assets/fonts/`, described in its `FONTS.md`), so the site and the screenshots of the
application show the same letters. Both families are licensed under the SIL Open Font License 1.1; the full text of each
licence is next to the files.

| File                                     | Family                                               | Use on the site                       | Licence                 | Copyright                                                                      |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `Inter-Variable-wght400-700-latin.woff2` | Inter (variable: `opsz` 14 to 32, `wght` 400 to 700) | Text, headings, navigation            | `Inter-OFL.txt`         | The Inter Project Authors, https://github.com/rsms/inter                       |
| `JetBrainsMono-Regular-latin.woff2`      | JetBrains Mono, regular (400)                        | Code, identifiers, file names, values | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors, https://github.com/JetBrains/JetBrainsMono |
| `JetBrainsMono-Bold-latin.woff2`         | JetBrains Mono, bold (700)                           | Emphasis in code                      | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors                                             |

The files are Latin subsets in WOFF2: Basic Latin, Latin-1 Supplement (the accented letters, `ñ`, `¿` and `¡` of Spanish), Latin
Extended-A, general punctuation, arrows, geometric shapes and the minus sign. The subsetting command is in
`packages/zplc-ide/src/assets/fonts/FONTS.md`. The Inter file of the site is the application's file with its weight axis limited to 400 to 700, the weights the site uses, which makes it a third smaller:
`python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib import instancer; f = TTFont('Inter-Variable-latin.woff2'); g = instancer.instantiateVariableFont(f, {'wght': (400, 700)}); g.flavor = 'woff2'; g.save('Inter-Variable-wght400-700-latin.woff2')"`.
When the application changes a file, copy or derive it here again with its licence.
