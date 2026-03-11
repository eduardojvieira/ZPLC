# Contract: Docusaurus Styling Preservation

The documentation overhaul is bound by a strict visual preservation contract. This contract dictates that the rewritten site MUST NOT regress the current "Industrial" visual identity.

## Contract Constraints

### 1. CSS Token Preservation
The file `docs/src/css/custom.css` represents the primary styling contract. 
- All existing color CSS variables (e.g., cyan, teal, orange/green/red accents, purple accents) MUST remain intact and assigned to the same logical properties.
- The `[data-theme='dark']` and `[data-theme='light']` behavior must be preserved exactly.

### 2. Landing Page Identity
The components located in `docs/src/components/LandingPage/*` and `docs/src/pages/index.js` form the visual contract for the entry point.
- The grid patterns, glows, and layered card aesthetic must not be replaced by standard Docusaurus feature blocks.
- The industrial UI feel is required; a flat, generic Docusaurus look is a breach of contract.

### 3. Structural Component Styling
Standard markdown components utilized by Docusaurus (buttons, navbars, sidebars, tables, admonitions, and code blocks) MUST inherit the current ZPLC styling language. Minor CSS cleanup and accessibility normalization are permitted only if they do not alter the recognized brand identity.
