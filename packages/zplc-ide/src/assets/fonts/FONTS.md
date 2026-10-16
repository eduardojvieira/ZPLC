# Bundled fonts (UX-006)

Studio ships its interface and code typefaces so that a person sees the same letters on Windows, macOS and Linux. Both
families are open-licensed under the SIL Open Font License 1.1; the full text of each licence sits next to the files, is
copied into the application as `licenses/*.txt` (`packages/zplc-ide/public/licenses/`), and is named in THIRD-PARTY-NOTICES.txt
(`scripts/release/font-licences.json`).

| File | Family | Use | Licence | Copyright |
|---|---|---|---|---|
| `Inter-Variable-latin.woff2` | Inter (variable, weight 100 to 900) | Interface | `Inter-OFL.txt` | The Inter Project Authors, https://github.com/rsms/inter |
| `JetBrainsMono-Regular-latin.woff2` | JetBrains Mono, regular (400) | Code, identifiers, values, addresses | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors, https://github.com/JetBrains/JetBrainsMono |
| `JetBrainsMono-Bold-latin.woff2` | JetBrains Mono, bold (700) | Emphasis in code and values | `JetBrainsMono-OFL.txt` | The JetBrains Mono Project Authors |

## What the files are

They are subsets of the font software, converted to WOFF2, that keep the OpenType features (tabular numerals `tnum`,
slashed zero `zero`) and these characters: Basic Latin, Latin-1 Supplement, Latin Extended-A, general punctuation, arrows,
geometric shapes (the signal glyphs), the minus sign and the check marks.

- Inter is subset from Inter 4.001 (`/usr/share/fonts/inter/InterVariable.ttf` of the Arch Linux `inter-font` package).
- JetBrains Mono is subset from the Nerd Fonts 3.5.1 build of JetBrains Mono 2.304 (the Arch Linux
  `ttf-jetbrains-mono-nerd-basic` package). The subset keeps the original Latin glyphs only; none of the patched icon glyphs
  of the Nerd Fonts project is in the files. Replace it with the upstream JetBrains Mono 2.304 release files when they are
  at hand: the file names and the `@font-face` rules do not change.

The subsetting command, for a repeat:

```
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2260,U+2264-2265,U+25A0-25FF,U+2713,U+2717"
pyftsubset InterVariable.ttf --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 --output-file=Inter-Variable-latin.woff2
pyftsubset JetBrainsMono-Regular.ttf --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 --output-file=JetBrainsMono-Regular-latin.woff2
```

## Changing a typeface

The families are tokens (`--font-sans`, `--font-mono` in `src/theme/tokens.ts`); the `@font-face` rules are in
`src/theme/fonts.css`. The choice of the two families is the owner's to approve (plan WP-39): replace the files, their
licence text and this table together.
