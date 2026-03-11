# Contract: GitHub Pages Deployment

The documentation CI/CD pipeline acts as the operational contract for docs availability.

## Contract Constraints

### 1. Build Verification
Before any PR touching the `docs/` directory is merged, the following MUST be programmatically verified:
- Broken internal links MUST fail the build.
- Missing imports in MDX components MUST fail the build.
- Invalid frontmatter schemas MUST fail the build.

### 2. Deployment Artifacts
The output of `npm run build` (or equivalent Docusaurus build command) in the `docs/` directory MUST produce static assets fully compatible with a GitHub Pages environment.

### 3. Pathing and Assets
The `docusaurus.config.js` `url` and `baseUrl` MUST correctly match the expected GitHub Pages repository pathing (e.g., `https://[org].github.io/zplc/` or custom domain). If broken, CSS, images, and JavaScript chunks will fail to load, resulting in an unstyled or non-functional site. This configuration acts as a hard contract for deployment success.
