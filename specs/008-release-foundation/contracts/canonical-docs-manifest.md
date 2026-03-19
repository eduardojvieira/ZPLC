# Contract: Canonical Docs Manifest

This contract defines the release-blocking user-facing documentation surface for `v1.5.0`.

## Release-Blocking Canonical Pages

The following slugs MUST exist in English and Spanish before release sign-off:

- `getting-started/index`
- `platform-overview/index`
- `architecture/index`
- `integration/index`
- `runtime/index`
- `runtime/hal-contract`
- `runtime/memory-model`
- `runtime/scheduler`
- `runtime/connectivity`
- `runtime/communication-function-blocks`
- `languages/index`
- one canonical ST page
- `ide/index`
- `ide/overview`
- `ide/compiler`
- `ide/deployment`
- `operations/index`
- `reference/index`
- `release-notes/index`

## Required Fields Per Page

| Field | Description |
|-------|-------------|
| `slug` | Canonical page identifier |
| `english_path` | English source file |
| `spanish_path` | Spanish source file |
| `area` | Product area |
| `release_blocking` | Whether parity is mandatory |
| `owner` | Responsible role or maintainer |
| `status` | `missing`, `draft`, `review`, or `ready` |

## Contract Rules

1. Every release-blocking canonical slug MUST have an English and Spanish page.
2. `README.md` remains a concise entry point and MUST link to canonical docs rather than
   duplicate deep technical truth.
3. Release notes MUST describe only the verified delta and MUST link back to canonical
   docs for full reference.
4. Duplicate topic variants MUST be removed, redirected, or merged so each canonical topic
   has one authoritative English page and one authoritative Spanish page.
